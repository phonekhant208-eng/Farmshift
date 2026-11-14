import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzePlantHealth, rotationScores, rowsFromCsv } from '@/lib/plantHealth';

// Runs Module 4 + Module 1 on the test-guide CSVs in /data/scenarios
// (A = good, B = stress, C = missing soil + NDVI).
// The response also includes `scores`, which you can check against test_cases_expected.json:
//   A -> rice 100/low, black gram 100/low
//   B -> rice 25/high,  black gram 0/high
//   C -> rice 100/low,  black gram null/unknown
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || 'A';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid scenario id' }, { status: 400 });
  }
  try {
    const file = path.join(process.cwd(), 'data', 'scenarios', `scenario_${id.toUpperCase()}.csv`);
    const csv = await readFile(file, 'utf8');
    const rows = rowsFromCsv(csv);
    const analysis = analyzePlantHealth(rows);
    const scores = rotationScores(analysis, rows);
    return NextResponse.json(
      { success: true, scenario: id, analysis, scores },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch {
    return NextResponse.json({ success: false, error: `Scenario "${id}" not found` }, { status: 404 });
  }
}