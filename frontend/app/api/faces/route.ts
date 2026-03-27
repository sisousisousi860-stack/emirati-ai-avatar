import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET /api/faces — returns all registered people with their descriptors
export async function GET() {
  const client = await getDb();
  try {
    const { rows } = await client.query(
      "SELECT name, descriptor FROM face_descriptors ORDER BY created_at ASC"
    );

    // Group descriptors by name
    const grouped: Record<string, number[][]> = {};
    for (const row of rows) {
      if (!grouped[row.name]) grouped[row.name] = [];
      grouped[row.name].push(row.descriptor);
    }

    const result = Object.entries(grouped).map(([name, descriptors]) => ({
      name,
      descriptors,
    }));

    return NextResponse.json(result);
  } finally {
    client.release();
  }
}

// POST /api/faces — save one face descriptor
// body: { name: string, descriptor: number[] }
export async function POST(req: NextRequest) {
  const { name, descriptor } = await req.json();
  if (!name || !descriptor) {
    return NextResponse.json({ error: "name and descriptor required" }, { status: 400 });
  }

  const client = await getDb();
  try {
    await client.query(
      "INSERT INTO face_descriptors (name, descriptor) VALUES ($1, $2)",
      [name, JSON.stringify(descriptor)]
    );
    return NextResponse.json({ ok: true });
  } finally {
    client.release();
  }
}

// DELETE /api/faces — remove all descriptors for a person
// body: { name: string }
export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const client = await getDb();
  try {
    const { rowCount } = await client.query(
      "DELETE FROM face_descriptors WHERE name = $1",
      [name]
    );
    return NextResponse.json({ ok: true, deleted: rowCount });
  } finally {
    client.release();
  }
}
