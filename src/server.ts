import { app } from "./app";
import { envVariables } from "./config/envVariables";
import { swaggerUiOptions } from "./config/swagger";

const PORT = envVariables.PORT;
const HOST = "0.0.0.0";
const LOCALHOST = "localhost";

async function startServer() {
  try {
    await app.listen({ port: PORT, host: HOST });

    console.info(`\n\n🚀 Server is running at http://${LOCALHOST}:${PORT}`);
    console.info(`📚 Documentation http://${LOCALHOST}:${PORT}${swaggerUiOptions.routePrefix}\n`);
  } catch (error) {
    app.log.error(error);
    console.error(error);
    process.exit(1);
  }
}

void startServer();
