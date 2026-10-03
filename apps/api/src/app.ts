import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { whatsappRouter } from "./routes/whatsapp.routes.js";
import { twilioRouter } from "./routes/twilio.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { voiceToolsRouter } from "./routes/voice-tools.routes.js";
import { paymentsRouter } from "./routes/payments.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  app.use(cors());

  // Keep the raw bytes too: Paystack signs the exact body it sent.
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  app.use("/", healthRouter);
  app.use("/api", chatRouter);
  app.use("/api", whatsappRouter);
  app.use("/api", twilioRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/voice-tools", voiceToolsRouter);
  app.use("/api", paymentsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
