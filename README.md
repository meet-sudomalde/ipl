# IPL Auction

A browser game that runs an IPL-style player auction. Pick the franchises you want to bid for and the computer bids for the rest. Pick all ten teams to run the auction room for a group of friends on one screen.

## Run it

```
git clone https://github.com/meet-sudomalde/ipl.git
cd ipl
npm install
npm run dev
```

Open the address Vite prints, usually http://localhost:5173.

## How it works

- Each of the 10 teams starts with a ₹120 Cr purse.
- Players come up highest base price first. Bids rise in IPL slabs: ₹5 L up to ₹1 Cr, ₹10 L up to ₹2 Cr, ₹20 L up to ₹5 Cr, then ₹25 L.
- The hammer falls after 8 seconds without a new bid. You can also sell early or mark a player unsold.
- A squad holds up to 25 players with at most 8 from overseas. A team must keep enough purse to fill 18 places at ₹30 L.
- Unsold players can go back under the hammer once the main round ends, at lower computer valuations.
- The auction saves in the browser, so a refresh picks up where you left off.

Player ratings in `src/data.js` are rough game values that only steer the computer bidders.

## Scripts

- `npm run dev` starts the dev server.
- `npm test` runs the auction rule tests.
- `npm run build` builds a static site into `dist/`.
