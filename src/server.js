require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const courseRoutes = require("./routes/courseRoutes");

const app = express();
app.use(express.json());
app.use(cors());

// ── Swagger UI ────────────────────────────────────────────────────
const swaggerDoc = YAML.load(path.join(__dirname, "swagger.yaml"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// ── Routes ────────────────────────────────────────────────────────
app.use("/courses", courseRoutes);

// ── Diagnostic Routes (for testing gateway integration) ──────────
app.get("/diagnostics", async (req, res) => {
  const {
    checkEnrollmentStatus,
    getEnrollmentCount
  } = require("./services/externalServices");

  res.json({
    status: "Course Service Running",
    timestamp: new Date().toISOString(),
    configuration: {
      gatewayUrl: process.env.GATEWAY_URL || "not set (using default)",
      hasServiceToken: !!process.env.SERVICE_TOKEN,
      nodeEnv: process.env.NODE_ENV || "development"
    },
    endpoints: {
      health: "/health",
      courses: "/courses",
      diagnostics: "/diagnostics",
      testGateway: "/diagnostics/test-gateway",
      testEnrollment: "/diagnostics/test-enrollment/:courseId"
    }
  });
});

app.get("/diagnostics/test-gateway", async (req, res) => {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("DIAGNOSTIC: Testing API Gateway Connectivity");
    console.log("=".repeat(60));

    const gatewayUrl = process.env.GATEWAY_URL || "https://api-gateway-763150334229.us-central1.run.app";
    const hasToken = !!process.env.SERVICE_TOKEN;

    console.log(`Gateway URL: ${gatewayUrl}`);
    console.log(`Has SERVICE_TOKEN: ${hasToken}`);

    // Test basic connectivity
    let gatewayReachable = false;
    try {
      const healthCheck = await fetch(`${gatewayUrl}/health`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" }
      });
      gatewayReachable = healthCheck.ok;
      console.log(`Gateway health check: ${healthCheck.status} ${healthCheck.statusText}`);
    } catch (err) {
      console.error(`Gateway unreachable: ${err.message}`);
    }

    console.log("=".repeat(60) + "\n");

    res.json({
      test: "Gateway Connectivity Test",
      results: {
        gatewayUrl,
        hasServiceToken: hasToken,
        gatewayReachable,
        status: gatewayReachable ? "✅ Gateway is accessible" : "❌ Gateway is unreachable"
      },
      recommendations: !hasToken ? [
        "Set SERVICE_TOKEN environment variable",
        "Token is required for authenticated gateway requests"
      ] : [],
      nextSteps: [
        "Test enrollment integration: GET /diagnostics/test-enrollment/:courseId",
        "Check environment: GET /diagnostics/env"
      ]
    });
  } catch (err) {
    res.status(500).json({
      error: "Diagnostic test failed",
      message: err.message
    });
  }
});

app.get("/diagnostics/test-enrollment/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { getEnrollmentCount } = require("./services/externalServices");

    console.log("\n" + "=".repeat(60));
    console.log(`DIAGNOSTIC: Testing Enrollment Service for Course ${courseId}`);
    console.log("=".repeat(60));

    const enrollmentCount = await getEnrollmentCount(courseId);

    console.log("=".repeat(60) + "\n");

    res.json({
      test: "Enrollment Service Integration Test",
      courseId,
      results: {
        success: enrollmentCount !== null,
        enrollmentCount: enrollmentCount ?? "unavailable",
        status: enrollmentCount !== null 
          ? `✅ Successfully retrieved ${enrollmentCount} active enrollments`
          : "❌ Failed to retrieve enrollment data"
      },
      configuration: {
        gatewayUrl: process.env.GATEWAY_URL || "not set",
        hasServiceToken: !!process.env.SERVICE_TOKEN
      },
      troubleshooting: enrollmentCount === null ? [
        "Verify SERVICE_TOKEN is set correctly",
        "Check that API Gateway is routing /api/enrollments/* to Enrollment Service",
        "Verify Enrollment Service is running and accessible",
        "Check Cloud Run logs for both services"
      ] : []
    });
  } catch (err) {
    res.status(500).json({
      error: "Diagnostic test failed",
      message: err.message
    });
  }
});

app.get("/diagnostics/env", (req, res) => {
  res.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV || "not set",
      PORT: process.env.PORT || "not set (using default 3000)",
      GATEWAY_URL: process.env.GATEWAY_URL ? "✓ Set" : "✗ Not set (using default)",
      GATEWAY_URL_VALUE: process.env.GATEWAY_URL || "https://api-gateway-763150334229.us-central1.run.app (default)",
      SERVICE_TOKEN: process.env.SERVICE_TOKEN ? "✓ Set (hidden for security)" : "✗ Not set",
      MONGO_URI: process.env.MONGO_URI ? "✓ Set (hidden for security)" : "✗ Not set",
      JWT_SECRET: process.env.JWT_SECRET ? "✓ Set (hidden for security)" : "✗ Not set"
    },
    warnings: [
      ...(!process.env.SERVICE_TOKEN ? ["⚠️  SERVICE_TOKEN not set - inter-service calls may fail"] : []),
      ...(!process.env.MONGO_URI ? ["⚠️  MONGO_URI not set"] : []),
      ...(!process.env.JWT_SECRET ? ["⚠️  JWT_SECRET not set"] : [])
    ],
    timestamp: new Date().toISOString()
  });
});

// ── Health Check ──────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "course-service",
    timestamp: new Date().toISOString(),
    integrations: {
      gateway: process.env.GATEWAY_URL || "not configured",
      auth_service: "via API Gateway",
      enrollment_service: "via API Gateway"
    }
  });
});

// ── MongoDB ───────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
  }
};

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`🚀 Course Service running on port ${PORT}`);
    console.log(`📄 Swagger docs: http://localhost:${PORT}/api-docs`);
    console.log(`🔧 Diagnostics: http://localhost:${PORT}/diagnostics`);
  });
  return server;
};

if (require.main === module) {
  start();
}

module.exports = { app };
