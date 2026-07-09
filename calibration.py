from copy import deepcopy
import math
import cv2
import numpy as np
def check_contour_requirements(thresh,cnt, pattern_info=None):
    rect = cv2.minAreaRect(cnt)
    re_W,re_H=rect[1]
    ratio=max(re_H,re_W)/min(re_H,re_W)
    
    if ratio <0.6:
        return 0
    circle_area,total=analyze_contour_in_thresh(thresh,cnt)
    radius=(re_H+re_W)/8
    estimate_circle_area=math.pi * (radius ** 2)
    try:
        area_ratio=max(estimate_circle_area,circle_area)/min(estimate_circle_area,circle_area)
    except:
        return 0
    if area_ratio<0.8:
        return 0
    if pattern_info is not None:
        pattern_info[0]=re_H/2
        pattern_info[1]=re_W/2
    return rect[0]


def analyze_contour_in_thresh(thresh_img: np.ndarray, contour: np.ndarray):
    """
    thresh_img : single-channel binary image (0 and 255)
    contour    : single contour (Nx1x2 or Nx2), dtype int/float

    Returns:
        rect        : cv2.minAreaRect(contour)
        n_white     : number of white pixels (255) inside the contour
        n_black     : number of black pixels (0) inside the contour
        n_total     : total pixels inside contour (white + black)
    """

    # 1. Min area rect of the contour
      # ((cx,cy), (w,h), angle)

    # 2. Build a mask for the contour region
    h, w = thresh_img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    # mask1 = np.ones((h, w), dtype=np.uint8) * 255

    # Make sure contour shape is correct: (N, 1, 2)
    cnt = contour
    if cnt.ndim == 2:
        cnt = cnt.reshape(-1, 1, 2)

    cv2.drawContours(mask, [cnt], contourIdx=-1, color=255, thickness=-1)
    # cv2.drawContours(mask1, [cnt], contourIdx=-1, color=255, thickness=-1)
    # 3. Count white pixels inside contour
    #    Only look where mask == 255
    region = cv2.bitwise_and(thresh_img, thresh_img, mask=mask)
    n_white = cv2.countNonZero(region)
    n_total = cv2.countNonZero(mask)   # number of pixels inside contour
    n_black = n_total - n_white

    return n_black, n_total
def compute_area_and_percent(pts, H, W):
    """
    pts: list of (x,y)
    """
    if len(pts) < 3:
        return 0.0

    poly = np.array(pts, dtype=np.float32)
    area = cv2.contourArea(poly)  # in pixels^2
    img_area = float(H * W)
    percent = (area / img_area) * 100.0 if img_area > 0 else 0.0
    return percent


# import numpy as np



def warp_crop_gray(img, pts,dimension=None):
    """
    img: 2D numpy array (grayscale image)
    pts: iterable of four (x, y) points in ANY order
    returns: perspective-corrected cropped patch
    """
    # if img.ndim != 2:
    #     raise ValueError("img must be a 2D grayscale image")
    if len(pts) != 4:
        raise ValueError("Need exactly four points")

     # bottom-left: largest (y - x)

    (tl, tr, br, bl) = pts

    # --- compute width and height of the new image ---
    widthA = np.linalg.norm(br - bl)
    widthB = np.linalg.norm(tr - tl)
    
    
    heightA = np.linalg.norm(tr - br)
    heightB = np.linalg.norm(tl - bl)
    # maxHeight = int(max(heightA, heightB))
    if dimension is None:
     maxWidth = int(max(widthA, widthB))
     maxHeight = int(max(heightA, heightB))
    else:
        maxWidth,maxHeight=dimension 
    if maxWidth <= 0 or maxHeight <= 0:
        raise ValueError("Degenerate quadrilateral; check your points")
    def bisect_line_into_four(p1, p2,delta=[0,0,0]):
        """
        Return three internal points that divide the line segment
        between p1 and p2 into four equal parts.

        Parameters:
            p1 (tuple): First point (x1, y1)
            p2 (tuple): Second point (x2, y2)

        Returns:
            list of tuples: Three points [(x25, y25), (x50, y50), (x75, y75)]
        """
        x1, y1 = p1
        x2, y2 = p2

        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)

        # Unit direction vector
        ux, uy = dx / length, dy / length

        # Base positions at 25%, 50%, 75%
        base25 = (x1 + 0.25 * dx, y1 + 0.25 * dy)
        base50 = (x1 + 0.50 * dx, y1 + 0.50 * dy)
        base75 = (x1 + 0.75 * dx, y1 + 0.75 * dy)

        # Add delta offsets along the line direction
        p25 = (base25[0] + delta[0] * ux, base25[1] + delta[0] * uy)
        p50 = (base50[0] + delta[1] * ux, base50[1] + delta[1] * uy)
        p75 = (base75[0] + delta[2] * ux, base75[1] + delta[2] * uy)

        return [p25, p50, p75]


    # destination rectangle
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]
    ], dtype="float32")
#     hunu_up=bisect_line_into_four(dst[0],dst[1])
#     hunu_dn=bisect_line_into_four(dst[2],dst[3])
#     bhayeko_up=bisect_line_into_four(pts[0],pts[1],[5,300,5])
#     bhayeko_dn=bisect_line_into_four(pts[2],pts[3],[-5,-300,-5])
#     # print(dst)
#    # Insert hunu_up after index 0 (between dst[0] and dst[1])
#     dst = np.insert(dst, 3, hunu_dn, axis=0)

#     # Insert hunu_dn after index 2 (between dst[2] and dst[3])
#     dst = np.insert(dst, 1, hunu_up, axis=0)
#     print("before",pts)
#     pts = np.insert(pts, 3, bhayeko_dn, axis=0)

#     # Insert hunu_dn after index 2 (between pts[2] and pts[3])
#     pts = np.insert(pts, 1, bhayeko_up, axis=0)
#     print("After:",pts)
#     print("dst boletoh",dst)
#     print("pts boletoh",pts)
    # ano=func(img,dst,pts)
    
    # M, mask = cv2.findHomography(pts, dst, cv2.RANSAC,1000.0)
    # print(mask)
    # cv2.imwrite("mask.jpg",ano)
    M= cv2.getPerspectiveTransform(pts, dst)#, cv2.RANSAC)
# Apply affine warp
    print((maxWidth, maxHeight))
    warped = cv2.warpPerspective(img, M, (maxWidth, maxHeight))

    
    return warped
def calibrate(gray_imgn: np.ndarray,dimeninfo=None):
    """
    Find contours in a grayscale image and display their areas.

    Parameters
    ----------
    gray_img : np.ndarray
        Input grayscale image as a NumPy array.

    Returns
    -------
    areas : list of float
        List of contour areas.

    Notes
    -----
    - The input must be a single-channel grayscale image.
    - Contours are detected using binary thresholding.
    - Areas are computed using cv2.contourArea().
    
    Author: Shreejit
    """
    if len(gray_imgn.shape) != 2:
        gray_img = cv2.cvtColor(gray_imgn, cv2.COLOR_BGR2GRAY)
    else:
        gray_img=deepcopy(gray_imgn)    

        # raise ValueError("Input image must be grayscale (2D array).")

    # Convert grayscale to binary
    _, thresh = cv2.threshold(gray_img, 180, 255, cv2.THRESH_BINARY_INV)
    H, W=thresh.shape[:2]
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Calculate areas
    # areas = [cv2.contourArea(c) for c in contours]
    pattern = []
    # Print areas
    patrn_HW=[0,0]
    for i, c in enumerate(contours):
        area=compute_area_and_percent(c,H, W)
        # print("area1",area)
        if 0.05<area<0.1:            
            iligble_val=check_contour_requirements(thresh,c,pattern_info=patrn_HW)
            # print(iligble_val)
            if iligble_val and iligble_val not in pattern:
                pattern.append(iligble_val)
                break

    for i in range(len(contours)-1,0,-1):
        area=compute_area_and_percent(contours[i],H, W)
        # print("area2",area)
        if 0.05<area<0.1:
            iligble_val=check_contour_requirements(thresh,contours[i])
            # print(iligble_val)
            if iligble_val and iligble_val not in pattern:
             pattern.append(iligble_val)
             break
    contours_sorted = sorted(contours, key=lambda c: cv2.boundingRect(c)[1])
    for i, c in enumerate(contours_sorted):
        area=compute_area_and_percent(c,H, W)
        # print("area3",area)
        if 0.05<area<0.1:
            iligble_val=check_contour_requirements(thresh,c)
            # print(iligble_val)
            if iligble_val and iligble_val not in pattern:
                pattern.append(iligble_val)
                break
    for i in range(len(contours_sorted)-1,0,-1):
        area=compute_area_and_percent(contours_sorted[i],H, W)
        # print("area4",area)
        if 0.05<area<0.1:
            iligble_val=check_contour_requirements(thresh,contours_sorted[i])
            if iligble_val and iligble_val not in pattern:
             pattern.append(iligble_val)
             break
    # 
    
    pattern = np.array(pattern, dtype="float32")

    # --- reorder points: tl, tr, br, bl ---
    rect = np.zeros((4, 2), dtype="float32")
    s = pattern.sum(axis=1)
    rect[0] = pattern[np.argmin(s)]  # top-left: smallest x+y
    rect[2] = pattern[np.argmax(s)]  # bottom-right: largest x+y

    diff = np.diff(pattern, axis=1)  # y - x
    rect[1] = pattern[np.argmin(diff)]  # top-right: smallest (y - x)
    rect[3] = pattern[np.argmax(diff)] 
    mid=(rect[2]+rect[3])/2
    cx, cy = int(mid[0]), int(mid[1])
    # print(patrn_HW)
    x1 = max(0, int(cx - (patrn_HW[1] // 2)))
    y1 = max(0, int(cy - (patrn_HW[0] // 2)))
    x2 = min(W, int((cx + patrn_HW[1] // 2)))
    y2 = min(H, int((cy + patrn_HW[0] // 2)))
    # print(x1,x2,y1,y2)
    # print("candidate",pattern)
    # cv2.imshow('hello1.jpg',thresh)
    # cv2.waitKey(0)
    
    # cv2.imwrite('hello1.jpg',crop)
    crop_mid=thresh[int(y1):int(y2), int(x1):int(x2)]
    mid_point_below=np.sum(crop_mid//255)
    mid=(rect[0]+rect[1])/2
    cx, cy = int(mid[0]), int(mid[1])
    # print(patrn_HW)
    x1 = max(0, int(cx - (patrn_HW[1] // 2)))
    y1 = max(0, int(cy - (patrn_HW[0] // 2)))
    x2 = min(W, int((cx + patrn_HW[1] // 2)))
    y2 = min(H, int((cy + patrn_HW[0] // 2)))
    # print(x1,x2,y1,y2)
    # print("candidate",pattern)
    # cv2.imshow('hello1.jpg',thresh)
    # cv2.waitKey(0)
    # crop=warp_crop_gray(gray_imgn,rect,dimeninfo)
    # cv2.imwrite('hello1.jpg',crop)
    crop_mid=thresh[int(y1):int(y2), int(x1):int(x2)]
    mid_point_upper=np.sum(crop_mid//255)
    # print(mid_point)
    crop=warp_crop_gray(gray_imgn,rect,dimeninfo)
    if mid_point_below<mid_point_upper:
        crop=cv2.rotate(crop ,cv2.ROTATE_180)
    # print(mid_point)
    # cv2.imwrite('hello2.jpg',crop)
    # cv2.waitKey(0)
    # mask = np.zeros((H,W), dtype=np.uint8)  
    # print(pattern)   
    # cv2.drawContours(mask, pattern, contourIdx=-1, color=255, thickness=-1)     
    
    return crop

        