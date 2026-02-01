export const ENV = {
  IS_PROD: process.env.NODE_ENV === "production",

  FRONTEND_URL:
    process.env.FRONTEND_URL || "http://localhost:5173",

  BACKEND_URL:
    process.env.BACKEND_URL || "http://localhost:4000",

  SALESFORCE_LOGIN_URL: "https://login.salesforce.com",
};

export const CORS_ORIGINS = [
  "http://localhost:5173",
  "https://sf-validation-rule.netlify.app",
];
