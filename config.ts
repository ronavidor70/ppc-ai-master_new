// Configuration for Supabase deployment
export const config = {
  // Supabase Configuration
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  
  // API Base URL - uses Supabase Functions in production, localhost in development
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 
    (import.meta.env.MODE === 'production' 
      ? `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`
      : 'http://localhost:5001'),
  
  // Frontend URL for redirects
  frontendUrl: import.meta.env.VITE_FRONTEND_URL || 
    (import.meta.env.MODE === 'production'
      ? 'https://ppc-ai-master-new.onrender.com'
      : 'http://localhost:3000'),
  
  // Environment
  isProduction: import.meta.env.MODE === 'production',
  isDevelopment: import.meta.env.MODE === 'development'
};
