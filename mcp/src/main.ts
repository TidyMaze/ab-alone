// The stdio entry point an MCP host starts (README, "Let an AI agent play"): a local game against the bot or a boss,
// or an online room over the browser client's Trystero transport.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { RTCPeerConnection } from 'werift';
import { p2pPeers, p2pTransport } from '../../client/src/p2p';
import { bossIds, newEncounter, newEngine, worldRules } from './engine';
import { Session } from './game';
import { createServer } from './server';
import { OpenWorld } from './world';
import { WorldRoom } from './worldroom';

// Trystero takes the global RTCPeerConnection when it is given none, and Node has none: werift is WebRTC in Node.
Object.assign(globalThis, { RTCPeerConnection });

const session = new Session(newEngine, newEncounter, (room) => p2pTransport(room));
const world = new OpenWorld(worldRules(), bossIds, session);
await createServer(session, world, new WorldRoom(world, worldRules(), p2pPeers)).connect(new StdioServerTransport());
