import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://spaceapp.mibyte.site';
const supabaseKey = 'sb_publishable_QVHf04m4QYibOHaQW9g4kA_pKCCL2Ti';

export const supabase = createClient(supabaseUrl, supabaseKey);





