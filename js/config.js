    const SUPABASE_URL = 'https://udjzyngpxvidjzulbq.supabase.co';
	const SUPABASE_ANON_KEY = 'sb_publishable_WPNXbw_1Os1PbGotAz1z-w_rF-Ze5Pv';
    
    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    const supabaseClient = window.supabaseClient;

    const LOW_STOCK_THRESHOLD = 5;

