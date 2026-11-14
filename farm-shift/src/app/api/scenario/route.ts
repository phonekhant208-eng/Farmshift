import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzePlantHealth, rowsFromCsv } from '@/lib/plantHealth';

// Runs Module 4 on the test-guide CSVs in /data/scenarios (A = good, B = stress, C = missing soil + NDVI).
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || 'A';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid scenario id' }, { status: 400 });
  }
  try {
    const file = path.join(process.cwd(), 'data', 'scenarios', `scenario_${id}.csv`);
    const csv = await readFile(file, 'utf8');
    const analysis = analyzePlantHealth(rowsFromCsv(csv));
    return NextResponse.json(
      { success: true, scenario: id, analysis },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch {
    return NextResponse.json({ success: false, error: `Scenario "${id}" not found` }, { status: 404 });
  }
}
