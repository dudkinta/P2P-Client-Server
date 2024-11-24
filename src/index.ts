import ConfigLoader from "./network/helpers/config-loader.js";

async function main() {
  await ConfigLoader.initialize();
  const config = ConfigLoader.getInstance().getConfig();

  if (config.nodeType === config.roles.NODE) {
    await import("./network/node.js");
  } else if (config.nodeType === config.roles.RELAY) {
    await import("./network/relay.js");
  } else {
    console.error("Unknown node type!");
  }
}

main().catch((err) => {
  console.error("Failed to initialize configuration:", err);
});
