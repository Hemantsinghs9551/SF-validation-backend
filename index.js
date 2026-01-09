import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

let cachedApiVersion = null;

async function getLatestApiVersion(instance_url, access_token) {
  if (cachedApiVersion) return cachedApiVersion;

  const res = await axios.get(
    `${instance_url}/services/data`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    }
  );

  cachedApiVersion = res.data[0].version; 
  return cachedApiVersion;
}

app.post("/oauth/token", async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Authorization code is required" });
  }

  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      code,
    });

    const response = await axios.post(
      "https://login.salesforce.com/services/oauth2/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(err.response?.status || 500).json({
      error: "Token exchange failed",
      details: err.response?.data || err.message,
    });
  }
});


app.get("/validation-rules", async (req, res) => {
  const { access_token, instance_url } = req.headers;

  if (!access_token || !instance_url) {
    return res.status(400).json({
      error: "Missing access_token or instance_url in headers",
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
          q: "SELECT Id, ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'",
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

    const response = await axios.patch(
      `${instance_url}/services/data/v59.0/tooling/sobjects/ValidationRule/${id}`,
      {
        Metadata: metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, result: response.data });
  } catch (err) {
    console.error("Salesforce Metadata update error:", err.response?.data);

    res.status(err.response?.status || 500).json(
      err.response?.data || {
        error: "Failed to toggle validation rule",
      }
    );
  }
});
app.get("/sf/userinfo", async (req, res) => {
  try {
    const { access_token, instance_url } = req.headers;

    const sfRes = await axios.get(
      `${instance_url}/services/oauth2/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    res.json(sfRes.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
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
    const apiVersion = await getLatestApiVersion(
      instance_url,
      access_token
    );

    const response = await axios.get(
      `${instance_url}/services/data/v${apiVersion}/query`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
        params: {
          q: "SELECT Name, OrganizationType, IsSandbox, InstanceName FROM Organization",
        },
      }
    );

    res.json({
      apiVersion,
      ...response.data.records[0],
    });
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
