import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { CORS_ORIGINS, ENV } from "./constant.js";
 
dotenv.config();

const app = express();
// app.use(cors());
app.use(express.json());
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);


const PORT = process.env.PORT || 4000;

const pkceStore = new Map();

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}


app.get("/oauth/login", (req, res) => {
  const { loginUrl } = req.query;

  if (!loginUrl) {
    return res.status(400).json({ error: "loginUrl is required" });
  }

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomUUID();

  pkceStore.set(state, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    prompt: "login" 
  });

  res.redirect(
    `${loginUrl}/services/oauth2/authorize?${params.toString()}`
  );
});

app.get("/oauth/callback", (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.redirect(
      `${ENV.FRONTEND_URL}/?error=${encodeURIComponent(
        error_description || error
      )}`
    );
  }

  res.redirect(
    `${ENV.FRONTEND_URL}/oauth-success?code=${encodeURIComponent(
      code
    )}&state=${encodeURIComponent(state)}`
  );
});




app.post("/oauth/token", async (req, res) => {
  const { code, state, loginUrl } = req.body;

  if (!code || !state || !loginUrl) {
    return res.status(400).json({
      error: "code, state, and loginUrl are required",
    });
  }

  const codeVerifier = pkceStore.get(state);

  if (!codeVerifier) {
    return res.status(400).json({
      error: "Invalid or expired PKCE state",
    });
  }

  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
    });

    const response = await axios.post(
      `${loginUrl}/services/oauth2/token`,
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    pkceStore.delete(state);

    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: "Token exchange failed",
      details: err.response?.data || err.message,
    });
  }
});


app.get("/validation-rules", async (req, res) => {
  const { access_token, instance_url } = req.headers;

  if (!access_token || !instance_url) {
    return res.status(400).json({
      error: "Missing access_token or instance_url",
    });
  }

  try {
    const response = await axios.get(
      `${instance_url}/services/data/v59.0/tooling/query`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
        params: {
          q: "SELECT Id, ValidationName, Active FROM ValidationRule",
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(
      err.response?.data || { error: "Failed to fetch validation rules" }
    );
  }
});


async function getValidationRuleMetadata(instance_url, access_token, id) {
  const res = await axios.get(
    `${instance_url}/services/data/v59.0/tooling/sobjects/ValidationRule/${id}`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    }
  );

  return res.data.Metadata;
}

app.patch("/validation-rules/:id", async (req, res) => {
  const { id } = req.params;
  const { access_token, instance_url, active } = req.body;

  if (!access_token || !instance_url || typeof active !== "boolean") {
    return res.status(400).json({
      error: "Missing access_token, instance_url, or active flag",
    });
  }

  try {
    const metadata = await getValidationRuleMetadata(
      instance_url,
      access_token,
      id
    );

    metadata.active = active;

    await axios.patch(
      `${instance_url}/services/data/v59.0/tooling/sobjects/ValidationRule/${id}`,
      { Metadata: metadata },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(err.response?.status || 500).json(
      err.response?.data || { error: "Failed to toggle rule" }
    );
  }
});
app.get("/sf/userinfo", async (req, res) => {
  const { access_token, instance_url } = req.headers;

  try {
    const sfRes = await axios.get(
      `${instance_url}/services/oauth2/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    res.json(sfRes.data);
  } catch {
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});
app.get("/sf/organization", async (req, res) => {
  const { access_token, instance_url } = req.headers;

  if (!access_token || !instance_url) {
    return res.status(400).json({
      error: "Missing access_token or instance_url",
    });
  }

  try {
    const sfRes = await axios.get(
      `${instance_url}/services/data/v59.0/query`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
        params: {
          q: "SELECT Name, OrganizationType, IsSandbox, InstanceName FROM Organization",
        },
      }
    );

    res.json(sfRes.data.records[0]);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to fetch organization info",
    });
  }
});



app.get("/", (req, res) => {
  res.send("Backend is up and running!");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
