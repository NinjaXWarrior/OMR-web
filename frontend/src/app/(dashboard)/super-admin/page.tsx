import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

interface Org {
  org_id: string;
  name: string;
  created_at: string;
  exams_published: number;
}

/**
 * Server component: the middleware already restricts /super-admin to
 * SUPER_ADMIN, and the backend admin key stays server-side — the browser
 * only ever receives the rendered HTML.
 */
export default async function SuperAdminPage() {
  const { sessionClaims } = await auth();
  if (sessionClaims?.metadata?.role !== "SUPER_ADMIN") {
    return <p className="text-sm text-muted-foreground">Super admin access required.</p>;
  }

  let orgs: Org[] = [];
  let error: string | null = null;
  try {
    const res = await fetch(`${BASE_URL}/orgs`, {
      headers: { "X-Admin-Key": process.env.OMR_ADMIN_KEY ?? "admin" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    orgs = (await res.json()).organizations;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load organizations";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organizations</CardTitle>
        <CardDescription>
          Every registered organization with its unique ID. Click an organization to open its
          dashboard with full result history. Share an ID with an institution&apos;s students so
          they can look up published results.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">Could not reach the grading backend: {error}</p>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organizations registered yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Exams published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.org_id}>
                  <TableCell className="font-mono font-semibold">
                    <Link href={`/super-admin/${o.org_id}`} className="hover:underline">
                      {o.org_id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/super-admin/${o.org_id}`} className="hover:underline">
                      {o.name}
                    </Link>
                  </TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{o.exams_published}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
