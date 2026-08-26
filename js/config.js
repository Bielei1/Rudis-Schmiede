    const SUPABASE_URL = 'https://cobndqltfctyaihzqatt.supabase.co/rest/v1/';
	const SUPABASE_ANON_KEY = 'sb_publishable_GJhsLbNkikl3XCCO47sCCA_08NREIgY';
    
    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    const supabaseClient = window.supabaseClient;

    const LOW_STOCK_THRESHOLD = 5;

