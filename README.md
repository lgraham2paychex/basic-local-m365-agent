# Basic Local Chatbot Agent for M365 Playgrounds

## Requirements

This chatbot agent runs in NodeJs 24 which is **required** due to MS node_modules packages.

### Starting the Agent
 1. Make sure NodeJS is currently loaded in your PATH (`node --version`).
 2. Set the certificate environment variable to install the node modules and to talk to LangChain. Otherwise you will get `SELF_SIGNED_CERT_IN_CHAIN`.
 3. Make sure to do `npm install` at least once.
 4. Update the values in config.mjs to talk to your LangChain agent, or use set the environment variables of the same name.
 5. Call `node index.mjs`
 
### Starting the chat playground 
 1. Make sure NodeJS is currently loaded in your PATH (`node --version`).
 2. Start the playground with `.\node_modules\.bin\teamsapptester`.
 3. The playground should open automatically. Otherwise go to http://localhost:56150/
 4. You will be greeted with some of the available commands. Use /langchain to talk to the configurate LangChain agent. Use /echo for echo mode. Use /connection for a quick check of the LangChain connectivity.