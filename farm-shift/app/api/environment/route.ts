import { NextResponse } from 'next/server';
import { buildEnvironmentData } from '@/services/engine/environmentBuilder';
import { evaluateCrops } from '@/services/engine/cropEngine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    
    const lat = parseFloat(searchParams.get('lat') || '16.8661');
    const lon = parseFloat(searchParams.get('lon') || '96.1951');
    const startDate = searchParams.get('startDate') || '20260501';
    const endDate = searchParams.get('endDate') || '20260531';

    const envData = await buildEnvironmentData(lat, lon, startDate, endDate);
    const evaluationResult = evaluateCrops(envData);

    return NextResponse.json(
      {
        success: true,
        queryLocation: { lat, lon },
        environment: envData,
        evaluation: evaluationResult
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}