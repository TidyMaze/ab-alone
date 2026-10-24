// The stdio entry point an MCP host starts (README, "Let an AI agent play"): one local game against the bot or a boss.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { newEncounter, newEngine } from './engine';
import { Session } from './game';
import { createServer } from './server';

await createServer(new Session(newEngine, newEncounter)).connect(new StdioServerTransport());
