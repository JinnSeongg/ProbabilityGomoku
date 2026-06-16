# Probability Gomoku

A real-time 1 vs 1 web game based on probability-driven Gomoku and pre-move card play.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The Socket.IO server runs on `http://127.0.0.1:3001`.

## Implemented

- Room creation and room-code joining
- Two-player lobby and ready flow
- Starting card candidates: choose 3 of 5
- 11x11 and 13x13 board options
- Server-side probability rolls and win detection
- One card before each move
- Private prediction results for information cards
- Active effects, bad luck stacks, game logs, and chat
- English UI and card names

## Structure

- `client/src`: React UI
- `server/src`: Express and Socket.IO game server
- `shared`: shared types, card definitions, constants, and rules


---
This project was created with AI.
