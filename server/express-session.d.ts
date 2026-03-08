declare module 'express-session' {
  interface SessionData {
    shopifyState?: string;
    shopifyShop?: string;
    shopifyAccessToken?: string;
    shopifyStoreName?: string;
  }
}
