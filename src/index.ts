import { config } from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ServerManager } from "./server/server.js";
import type { AppConfig } from "./config/types.js";
import { defaultConfig } from "./config/defaults.js";

config();

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("vs2lma")
    .usage("$0 [args]")
    .option("url", {
      type: "string",
      description: "API base URL",
    })
    .option("apikey", {
      type: "string",
      description: "api key",
    })
    .option("host", {
      type: "string",
      description: "server host",
    })
    .option("port", {
      type: "number",
      description: "server port",
    })
    .option("cap", {
      type: "array",
      array: true,
      string: true,
      description: "capabilities",
      choices: ["tools", "thinking"],
    })
    .help("h")
    .alias("h", "help")
    .parse();

  const appConfig: AppConfig = {
    baseUrl:
      argv.url ||
      process.env.BASE_URL ||
      defaultConfig.baseUrl,
    apiKey:
      argv.apikey ||
      process.env.API_KEY ||
      "",
    host: argv.host || defaultConfig.host,
    port: argv.port || defaultConfig.port,
    capabilities: {
      tools: argv.cap?.includes("tools") ?? defaultConfig.capabilities.tools,
      thinking:
        argv.cap?.includes("thinking") ?? defaultConfig.capabilities.thinking,
    },
    autoStartServer: false,
    minimizeToTray: false,
  };

  if (!appConfig.baseUrl || !appConfig.apiKey) {
    console.log(
      "Please set the apikey and baseurl either via the command line or in a .env file."
    );
    process.exit(1);
  }

  appConfig.baseUrl = appConfig.baseUrl.replace(/\/$/, "");

  const manager = new ServerManager();
  try {
    await manager.start(appConfig);
  } catch (err: any) {
    console.error("Server startup error:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Server startup error:", err);
  process.exit(1);
});
