# IPL Auction

A live IPL-style player auction you play with friends. One person hosts a room. Everyone else joins from their own phone with a four-letter code or a QR code, picks a franchise and bids in real time. Any team nobody picks can be bid for by the computer.

## Play with friends on the same Wi-Fi

```
git clone https://github.com/meet-sudomalde/ipl.git
cd ipl
npm install
npm run play
```

The terminal prints two addresses:

```
On this computer:   http://localhost:5180
Friends on Wi-Fi:   http://192.168.x.x:5180
```

1. Open the first address, type your name and choose **Host a new room**.
2. Friends scan the QR code in the lobby, or open the Wi-Fi address and type the room code.
3. Everyone taps a franchise. The host picks the settings and starts the auction.

If friends can't connect, check that everyone is on the same Wi-Fi and that your firewall allows Node to accept incoming connections.

## Play with friends anywhere

Deploy it to a host that runs Node and supports WebSockets. The repo includes a `render.yaml` for [Render](https://render.com):

1. Sign in to Render with GitHub and choose **New**, then **Blueprint**.
2. Pick this repository. Render reads `render.yaml`, then builds and starts the server.
3. Share the `onrender.com` address with your friends.

Render's free plan sleeps after a period with no visitors, so the first visit can take up to a minute to load. Rooms live in server memory and are lost when the server restarts.

## What's in the game

- **Rooms.** Hosts get a room code, an invite link and a QR code. People who leave can rejoin with the same browser and keep their team.
- **Host settings.** The host sets a bid clock of 5, 8, 12 or 15 seconds, a purse of ₹90 to ₹150 Cr, the player order, and whether computer teams bid.
- **Bidding.** Bids rise in IPL steps: ₹5 L up to ₹1 Cr, ₹10 L up to ₹2 Cr, ₹20 L up to ₹5 Cr, then ₹25 L. A jump bid skips one step. On a laptop, press B to bid and J to jump.
- **Squad rules.** Squads hold up to 25 players with at most 8 from overseas. Each team must keep enough purse to fill 18 places at ₹30 L.
- **Host controls.** The host can pause the auction, sell a player early, mark a player unsold, and re-auction unsold players at the end.
- **Room life.** The room has chat, emoji reactions, sound effects and per-team squad views. Each player also has a private shortlist of players to watch for.
- **Results.** The results screen ranks squads by their best eleven, picks the standout buys, and copies a summary you can paste into a group chat.

Player ratings in `src/data.js` are rough game values. They steer the computer bidders and the final standings.

## Scripts

- `npm run play` builds the app and starts the server.
- `npm run dev` starts the server with hot reload for development.
- `npm start` starts the server using an existing build.
- `npm test` runs the auction and room tests.

The port defaults to 5180. To change it, set `PORT`, for example `PORT=8000 npm run play`.
