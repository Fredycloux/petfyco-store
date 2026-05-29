import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pet_services')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ services: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ services: data ?? [] });
}
