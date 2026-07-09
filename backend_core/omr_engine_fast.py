import base64
from collections import defaultdict
import os
import csv
import pickle
import io
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

import numpy as np
import cv2

from calibration import calibrate as get_calibrated_image
# from calibrate import undistort_image


import csv
from typing import List, Tuple

AnswerKeyRow = Tuple[int, str, float, float, str]
# (Question, Subject, Marks_Correct, Negative_Percent, Answer)

def _load_answers_from_reader(reader: csv.DictReader, source_name: str) -> Tuple[int, List[AnswerKeyRow]]:
    rows: List[AnswerKeyRow] = []

    required = {"Question", "Subject", "Marks_Correct", "Negative_Percent", "Answer"}
    missing = required - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"Missing columns in {source_name}: {sorted(missing)}")

    for line_no, row in enumerate(reader, start=2):  # header is line 1
        q_raw = (row.get("Question") or "").strip()
        if not q_raw:
            continue  # skip blank rows

        try:
            q = int(q_raw)
        except ValueError:
            raise ValueError(f"Invalid Question '{q_raw}' at line {line_no}")

        subject = (row.get("Subject") or "").strip()
        if not subject:
            raise ValueError(f"Empty Subject at line {line_no} (Question {q})")

        mc_raw = (row.get("Marks_Correct") or "").strip()
        np_raw = (row.get("Negative_Percent") or "").strip()
        ans = (row.get("Answer") or "").strip().upper()

        try:
            marks_correct = float(mc_raw)
        except ValueError:
            raise ValueError(f"Invalid Marks_Correct '{mc_raw}' at line {line_no} (Question {q})")

        try:
            negative_percent = float(np_raw)
        except ValueError:
            raise ValueError(f"Invalid Negative_Percent '{np_raw}' at line {line_no} (Question {q})")

        if marks_correct < 0:
            raise ValueError(f"Marks_Correct must be >= 0 at line {line_no} (Question {q})")
        if negative_percent < 0:
            raise ValueError(f"Negative_Percent must be >= 0 at line {line_no} (Question {q})")

        rows.append((q, subject, marks_correct, negative_percent, ans))

    # Sort by question number so processing order is stable
    rows.sort(key=lambda x: x[0])

    return len(rows), rows


def load_answers_from_csv(csv_path: str) -> Tuple[int, List[AnswerKeyRow]]:
    with open(csv_path, "r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return _load_answers_from_reader(reader, csv_path)


def load_answers_from_csv_bytes(csv_bytes: bytes, source_name: str = "uploaded answers.csv") -> Tuple[int, List[AnswerKeyRow]]:
    text_stream = io.StringIO(csv_bytes.decode("utf-8-sig"))
    reader = csv.DictReader(text_stream)
    return _load_answers_from_reader(reader, source_name)


def save_csv(records: List[dict], out_csv: str, columns: List[str]) -> None:
    with open(out_csv, mode="w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        for r in records:
            row = {k: r.get(k, "") for k in columns}
            w.writerow(row)


def _to_np_points(grid) -> np.ndarray:
    arr = np.array(grid, dtype=np.float32)
    if arr.ndim != 3 or arr.shape[2] != 2:
        raise ValueError(f"Grid must be (N,K,2). Got {arr.shape}")
    return arr


@dataclass
class OMRConfig:
    thresh_value: int = 120
    inv_thresh: bool = True
    box_w: int = 22
    box_h: int = 14
    fill_ratio: float = 0.32

cfg = OMRConfig(
    thresh_value=130,   # fixed to keep UI clean; change in engine if you want slider later
    inv_thresh=True,
    box_w=22,
    box_h=14,
    fill_ratio=0.3,
)
class OMRProcessorFast:
    """
    Fast OMR using integral image.
    - No drawing during normal processing.
    - Optional preview image with drawing (expensive) on demand only.
    """

    def __init__(
        self,
        template_bytes: Optional[bytes] = None,
        answers_csv_bytes: Optional[bytes] = None,
        template_name: str = "template.pickle",
        answers_name: str = "answers.csv",
    ):
        self.template_pickle = template_name
        self.answers_csv = answers_name
        self.template_bytes = template_bytes
        self.answers_csv_bytes = answers_csv_bytes
        self.cfg = cfg

        if self.template_bytes is not None:
            data = pickle.loads(self.template_bytes)
        else:
            with open(self.template_pickle, "rb") as f:
                data = pickle.load(f)

        self.num_questions = int(data["inputs"]["num_questions"])

        rollno_grid = data["rollno"]["grid"]      # likely 10 x Ndigit
        answers_grid = data["answer"]["grid"]
        self.calib_h,self.calib_w=int(data['image_size']['height']),int(data['image_size']['width']) 
        # input()
        self.cfg.box_h=int(data['answer']['avg_height'])//2
        self.cfg.box_w=int(data['answer']['avg_width'])//2
        self.cfg.rollbox_h=int(data['rollno']['avg_height'])//2
        self.cfg.rollbox_w=int(data['rollno']['avg_width'])//2
        self.records=[]
        # print("-----------",self.cfg.box_h,self.cfg.box_w)
        # print(int('adf'))  # Nq x 4

        # transpose roll grid to (Ndigit,10)
        rollno_grid = list(map(list, zip(*rollno_grid)))

        if len(rollno_grid) == 0:
            raise ValueError("Roll grid empty.")
        if any(len(row) != 10 for row in rollno_grid):
            raise ValueError("Each roll digit row must have 10 points.")
        if len(answers_grid) != self.num_questions:
            raise ValueError(f"answers_grid count {len(answers_grid)} != num_questions {self.num_questions}")
        if any(len(q) != 4 for q in answers_grid):
            raise ValueError("Each question must have 4 option points.")

        self.roll_pts = _to_np_points(rollno_grid)   # (Ndigit,10,2)
        self.ans_pts = _to_np_points(answers_grid)   # (Nq,4,2)

        self._prepared = False
        self._roll_boxes = None
        self._ans_boxes = None
        self._roll_area = None
        self._ans_area = None
        self._img_wh = None  # (w,h)
    def export_csv(self,records):
        if not records:
            return

        r0 = records[0]

        # 1) question keys are ints: 1..50
        q_int_keys = sorted([k for k in r0.keys() if isinstance(k, int)])

        # 2) subject-wise keys: marks_Science, marks_Maths, ...
        subj_keys = sorted([k for k in r0.keys() if isinstance(k, str) and k.startswith("marks_")])

        # 3) build export records with Q1..Q50 string keys
        export_records = []
        for rec in records:
            new_rec = dict(rec)  # shallow copy

            # create Q1..Q50 keys from int keys
            for q in q_int_keys:
                new_rec[f"Q{q}"] = rec.get(q, "")

            export_records.append(new_rec)

        # 4) columns order
        columns = (
            ["File_name", "Rollno"]
            + [f"Q{q}" for q in q_int_keys]
            + subj_keys
            + ["correct", "wrong", "skipped", "Invalid", "score", "total_questions"]
        )

        save_csv(export_records, columns)
    def _prepare_boxes_for_size(self, w: int, h: int) -> None:
        self._img_wh = (w, h)

        def make_boxes(pts: np.ndarray, type_box=False):
            if type_box:
                bx_w=self.cfg.rollbox_w
                bx_h=self.cfg.rollbox_h
            else:
                bx_w=self.cfg.box_w
                bx_h=self.cfg.box_h    
            cx = np.rint(pts[..., 0]).astype(np.int32)
            cy = np.rint(pts[..., 1]).astype(np.int32)
                        
            x1 = np.clip(cx - bx_w, 0, w - 1)
            y1 = np.clip(cy - bx_h, 0, h - 1)
            x2 = np.clip(cx + bx_w, 1, w)   # exclusive
            y2 = np.clip(cy + bx_h, 1, h)   # exclusive

            boxes = np.stack([x1, y1, x2, y2], axis=-1).reshape(-1, 4)
            # area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
            # area=self.cfg.box_w*self.cfg.box_h*4
            area=(np.pi) * bx_w * bx_h
            return boxes, area

        self._roll_boxes, self._roll_area = make_boxes(self.roll_pts,True)
        self._ans_boxes, self._ans_area = make_boxes(self.ans_pts)
        self._prepared = True

    @staticmethod
    def _rect_sum_integral(integ: np.ndarray, boxes: np.ndarray) -> np.ndarray:
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]
        return integ[y2, x2] - integ[y1, x2] - integ[y2, x1] + integ[y1, x1]
    @staticmethod
    def _ellipse_sum_integral(integ: np.ndarray, boxes: np.ndarray) -> np.ndarray:
        """
        Sum values inside an axis-aligned ellipse inscribed in each box.
        Assumes:
        - box width  = horizontal diameter
        - box height = vertical diameter
        - `integ` is a standard integral image where rect sum is:
                integ[y2,x2] - integ[y1,x2] - integ[y2,x1] + integ[y1,x1]
        - boxes are (x1, y1, x2, y2) with half-open ranges [x1,x2), [y1,y2)
        """
        x1 = boxes[:, 0].astype(np.int64)
        y1 = boxes[:, 1].astype(np.int64)
        x2 = boxes[:, 2].astype(np.int64)
        y2 = boxes[:, 3].astype(np.int64)

        out = np.zeros(len(boxes), dtype=integ.dtype)

        for i in range(len(boxes)):
            w = x2[i] - x1[i]
            h = y2[i] - y1[i]
            if w <= 0 or h <= 0:
                out[i] = 0
                continue

            # Ellipse parameters (inscribed in the box)
            a = w / 2.0  # semi-major (x)
            b = h / 2.0  # semi-minor (y)
            xc = (x1[i] + x2[i]) / 2.0
            yc = (y1[i] + y2[i]) / 2.0

            s = 0
            # Sum horizontal strips: for each pixel-row band [y, y+1)
            for y in range(y1[i], y2[i]):
                y_mid = y + 0.5  # center of the strip
                dy = (y_mid - yc) / b
                t = 1.0 - dy * dy
                if t <= 0.0:
                    continue

                x_span = a * np.sqrt(t)
                xl = int(np.ceil(xc - x_span))
                xr = int(np.floor(xc + x_span))

                # Convert to half-open [xl, xr+1)
                xr += 1

                # Clamp to the box bounds
                if xl < x1[i]:
                    xl = x1[i]
                if xr > x2[i]:
                    xr = x2[i]
                if xr <= xl:
                    continue

                # Rectangle sum for strip [y, y+1) × [xl, xr)
                s += integ[y + 1, xr] - integ[y, xr] - integ[y + 1, xl] + integ[y, xl]

            out[i] = s

        return out

    def _threshold_binary01(self, gray: np.ndarray) -> np.ndarray:
        ttype = cv2.THRESH_BINARY_INV if self.cfg.inv_thresh else cv2.THRESH_BINARY
        _, bw = cv2.threshold(gray, self.cfg.thresh_value, 1, cv2.THRESH_BINARY_INV)
        return bw.astype(np.uint8)

    @staticmethod
    def _decode_single_choice(marked_bool: np.ndarray) -> np.ndarray:
        """
        returns code per row:
          -2 => INV (multiple)
          -1 => skipped (none)
          >=0 => selected index
        """
        count = marked_bool.sum(axis=1)
        sel = marked_bool.argmax(axis=1)
        code = np.full((marked_bool.shape[0],), -1, dtype=np.int32)
        code[count == 1] = sel[count == 1]
        code[count > 1] = -2
        return code

    def _draw_boxes(
        self,
        canvas_bgr: np.ndarray,
        pts: np.ndarray,           # (N,K,2)
        marked: np.ndarray,        # (N,K) bool
        draw_all: bool,
        type_box=False,
        ans_av=None
    ) -> None:
        h, w = canvas_bgr.shape[:2]
        cx = np.rint(pts[..., 0]).astype(np.int32)
        cy = np.rint(pts[..., 1]).astype(np.int32)

        bw = self.cfg.box_w
        bh = self.cfg.box_h
        if type_box:
            bw = self.cfg.rollbox_w
            bh = self.cfg.rollbox_h
        for r in range(cx.shape[0]):
            flag=True
            for c in range(cx.shape[1]):
                is_marked = bool(marked[r, c])
                if (not draw_all) and (not is_marked):
                    continue

                x1 = max(cx[r, c] - bw, 0)
                y1 = max(cy[r, c] - bh, 0)
                x2 = min(cx[r, c] + bw, w - 1)
                y2 = min(cy[r, c] + bh, h - 1)
                if ans_av is not None:
                 if flag:
                  try:
                    cond=ans_av.pop() if is_marked else None
                  except:
                      raise ValueError("select correct format type")
                 if cond is not None and is_marked:
                    flag=False
                    if cond==-1:
                         txtcol=(0,0,255)
                         label='incorrect'
                    elif cond==0:
                         txtcol=(100,0,255)
                         label='invalid'
                    elif cond==1:
                         txtcol=(0,255,0)
                         label='correct'
                    center = (((x1 + x2) // 2)+12, (y1 + y2) // 2)
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    fontScale = 0.7
                    # color = (0, 255, 0)  # Green
                    thickness = 1

                    # Put text on image
                    cv2.putText(canvas_bgr, label, center, font, fontScale, txtcol, thickness, cv2.LINE_AA)
          
                col = (0, 0, 255) if is_marked else (0, 255, 255)
                # center = ((x1 + x2) // 2, (y1 + y2) // 2)
                # axes = (abs(x2 - x1) // 2, abs(y2 - y1) // 2)

                # Draw ellipse instead of rectangle
                cv2.rectangle(canvas_bgr, (x1, y1), (x2, y2), col, 1)
                # cv2.ellipse(canvas_bgr, center, axes, angle=0, startAngle=0, endAngle=360, color=col, thickness=1)

    
    def save_invalid_sheet(self,img,file_name):
        folder_name = "Invalid_sheets"
        # file_name = f"invalid_sheet{ind}.jpg"
        file_name = os.path.basename(file_name)

        # Step 2: Create folder if it doesn't exist
        if not os.path.exists(folder_name):
            os.makedirs(folder_name)
            print(f"Folder '{folder_name}' created.")
        else:
            print(f"Folder '{folder_name}' already exists.")


        # Step 4: Save the image inside the folder
        file_path = os.path.join(folder_name, file_name)
        cv2.imwrite(file_path, img)
        print(f"Invalid sheets image saved at: {file_path}")
    
    
    def contours_of_white_regions_at_points(self,thresh: np.ndarray, point, connectivity=8):
        if thresh.ndim != 2:
            raise ValueError("thresh must be single-channel.")
        if thresh.dtype != np.uint8:
            raise ValueError("thresh must be uint8.")
        _, thresh = cv2.threshold(thresh, 127, 255, cv2.THRESH_BINARY_INV)
        x, y = map(int, point)
        h, w = thresh.shape

        if not (0 <= x < w and 0 <= y < h):
            return None

        if thresh[y, x] == 0:
            return None  # point on black → nothing to do

        # Label connected components
        _, labels = cv2.connectedComponents(thresh, connectivity=connectivity)

        label_id = labels[y, x]
        if label_id == 0:
            return None

        # Extract the region mask
        region_mask = (labels == label_id).astype(np.uint8) * 255

        # Find outer contour
        contours, _ = cv2.findContours(
            region_mask,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        return contours[0] if contours else None
    def process_image(
        self,
        img_path: str,
        image,
        want_preview: bool = True,
        preview_draw_all: bool = True,
        preview_downscale: float = 0.6,
    ) -> Tuple[dict, Optional[np.ndarray]]:
        img_gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # if img_gray is None:
        #     raise ValueError(f"Failed to read image: {img_path}")
        # img_gray = undistort_image(img_gray)
        if self.answers_csv_bytes is not None:
            self.question_len, self.answer_key = load_answers_from_csv_bytes(
                self.answers_csv_bytes,
                self.answers_csv,
            )
        else:
            self.question_len, self.answer_key = load_answers_from_csv(self.answers_csv)
        gray=get_calibrated_image(img_gray,(self.calib_w,self.calib_h))
        # gray=img_gray
        if gray is None:
          self.save_invalid_sheet(img_gray,img_path)
          raise ValueError(f"Failed to calibrate image: {img_path}")
        # gray=cv2.resize(gray,(self.calib_w,self.calib_h))
        # if gray is None:
        #     raise ValueError(f"Failed to calibrate image: {img_path}")

        h, w = gray.shape[:2]
        if not self._prepared or self._img_wh != (w, h):
            self._prepare_boxes_for_size(w, h)

        bw = self._threshold_binary01(gray)

        integ = cv2.integral(bw, sdepth=cv2.CV_32S)

        # Roll
        roll_sum = self._ellipse_sum_integral(integ, self._roll_boxes)
        roll_fill = roll_sum / np.maximum(self._roll_area, 1)
        roll_marked = (roll_fill > self.cfg.fill_ratio).reshape(self.roll_pts.shape[0], self.roll_pts.shape[1])
        roll_code = self._decode_single_choice(roll_marked)

        # allow digit 0
        if np.any(roll_code < 0):
            rollno = "INV"
        else:
            rollno = "".join(str(int(d)) for d in roll_code)

        # Answers
        ans_sum = self._ellipse_sum_integral(integ, self._ans_boxes)
        ans_fill = ans_sum / np.maximum(self._ans_area, 1)
        ans_marked = (ans_fill > self.cfg.fill_ratio).reshape(self.ans_pts.shape[0], self.ans_pts.shape[1])
        ans_code = self._decode_single_choice(ans_marked)

        idx_to_letter = np.array(["A", "B", "C", "D"])
        answers: Dict[int, str] = {}
        # question_len
        # self.question_len=50
        for i in range(self.question_len):
            qk = i+1
            c = int(ans_code[i])
            if c == -1:
                answers[qk] = ""
            elif c == -2:
                answers[qk] = "INV"
            else:
                answers[qk] = str(idx_to_letter[c])
        # Score
        score = 0.0
        correct = wrong = skipped = invalid = 0
        answers_data = []

        # subject-wise accumulators
        subj_score = defaultdict(float)
        subj_correct = defaultdict(int)
        subj_wrong = defaultdict(int)
        subj_skipped = defaultdict(int)
        subj_invalid = defaultdict(int)

        for q, subject, Marks_Correct, Negative_Percent, correct_ans in self.answer_key:
            stu = (answers.get(q, "") or "").strip().upper()
            correct_ans = (correct_ans or "").strip().upper()
            if stu == "":
                skipped += 1
                subj_skipped[subject] += 1
                # optional for preview alignment:
                # answers_data.append(None)
                continue

            if stu == "INV":
                invalid += 1
                subj_invalid[subject] += 1
                answers_data.append(0)
                continue

            if stu == correct_ans:
                correct += 1
                subj_correct[subject] += 1
                score += Marks_Correct
                subj_score[subject] += Marks_Correct
                answers_data.append(1)
            else:
                neg = Negative_Percent * Marks_Correct
                wrong += 1
                subj_wrong[subject] += 1
                score -= neg
                subj_score[subject] -= neg
                answers_data.append(-1)

        answers_data.reverse()
        # print(answers_data)
        record = {
            "File_name": os.path.basename(img_path),
            "Rollno": rollno,
            **answers,
            "score": format(score, ".2f"),
            "correct": correct,
            "wrong": wrong,
            "skipped": skipped,
            "Invalid": invalid,
            "total_questions": len(self.answer_key),
        }

        # subject-wise marks columns
        for subject, sc in subj_score.items():
            safe_subject = subject.replace(" ", "_")
            record[f"marks_{safe_subject}"] = format(sc, ".2f")

        # # (optional) subject-wise counts columns
        # for subject in subj_score.keys():
        #     record[f"{subject}_correct"] = subj_correct[subject]
        #     record[f"{subject}_wrong"] = subj_wrong[subject]
        #     record[f"{subject}_skipped"] = subj_skipped[subject]
        #     record[f"{subject}_invalid"] = subj_invalid[subject]

        preview = None
        if want_preview:
            canvas = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            # draw roll + answer boxes like old behavior
            self._draw_boxes(canvas, self.roll_pts, roll_marked, draw_all=preview_draw_all,type_box=True)
            self._draw_boxes(canvas, self.ans_pts, ans_marked, draw_all=preview_draw_all,ans_av=answers_data)
            self.put_record_on_image(canvas,{
            "Rollno": rollno,
            "score": format(score, ".2f"),
            "correct": correct,
            "wrong": wrong,
            "skipped": skipped,
            "Invalid": invalid,
        })
            # indices = np.where(bw == 1)
            # try:
            #  canvas[indices[0], indices[1], :] = [0, 0, 255]
            # except:
            #     pass 
            if preview_downscale and preview_downscale != 1.0:
                canvas = cv2.resize(canvas, (0, 0), fx=preview_downscale, fy=preview_downscale, interpolation=cv2.INTER_AREA)
            preview = canvas
            self.records.append(record)
        ok, buf = cv2.imencode(".jpg", preview)
        preview_b64 = base64.b64encode(buf).decode("utf-8")
        # print('self.rec',self.records)
        return {"status":"valid","score":float(score),"records": self.records, "preview_b64": preview_b64}

    def put_record_on_image(
    self,
    img,
    record,
    margin_ratio=0.02,       # % of image width
    line_gap_ratio=0.01,     # % of image height
    font=cv2.FONT_HERSHEY_SIMPLEX,
    color=(255, 0, 0)
):
        """
        Draw key-value pairs on the top-right corner of the image
        with all parameters scaled dynamically to image size.
        """

        h, w = img.shape[:2]

        # Dynamic scaling (these ratios actually matter)
        font_scale = min(w, h) / 1000
        thickness = max(1, int(min(w, h) / 500))

        margin_x = int(w * margin_ratio)
        margin_y = int(h * margin_ratio)
        line_gap = int(h * line_gap_ratio)

        # Starting Y position
        y = margin_y + int(30 * font_scale)

        for key, value in record.items():
            text = f"{key}: {value}"

            # Get text size to right-align
            (text_w, text_h), _ = cv2.getTextSize(
                text, font, font_scale, thickness
            )

            # X position so text hugs the right edge
            x = w - text_w - margin_x

            cv2.putText(
                img,
                text,
                (x, y),
                font,
                font_scale,
                color,
                thickness,
                cv2.LINE_AA
            )

            y += text_h + line_gap

        
