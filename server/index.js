import { createApp } from './app.js';
const port=Number(process.env.PORT)||3001;
const app=createApp();
app.server.listen(port,'0.0.0.0',()=>console.log(`CampusFind backend: http://localhost:${port}/api/health`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.server.close(()=>{app.db.close();process.exit(0);}));
