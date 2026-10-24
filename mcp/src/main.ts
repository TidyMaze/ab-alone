// The stdio entry point an MCP host starts (README, "Let an AI agent play"): a local game against the bot or a boss,
// or an online room over the browser client's Trystero transport.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { RTCPeerConnection } from 'werift';
import { p2pTransport } from '../../client/src/p2p';
import { newEncounter, newEngine } from './engine';
import { Session } from './game';
import { createServer } from './server';

// Trystero takes the global RTCPeerConnection when it is given none, and Node has none: werift is WebRTC in Node.
Object.assign(globalThis, { RTCPeerConnection });

const session = new Session(newEngine, newEncounter, (room) => p2pTransport(room));
await createServer(session).connect(new StdioServerTransport());
