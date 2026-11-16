# Gloamwood

An old-school multiplayer first-person RPG that runs in the browser. One computer runs the
server; everyone else just opens a web page.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer.

    cd gloamwood
    npm install
    npm start

Then open http://localhost:8080. Other people on the same home network open
`http://<that computer's IP address>:8080`. Each player picks a name and password and
creates their own character.

## Settings (environment variables)

| Variable      | Default  | Meaning                                              |
|---------------|----------|------------------------------------------------------|
| `PORT`        | `8080`   | Port to listen on                                    |
| `MAX_PLAYERS` | `50`     | Players allowed online at once                       |
| `DATA_DIR`    | `./data` | Where `characters.json` (all saved characters) lives |
| `GM_NAMES`    | (none)   | Comma-separated character names allowed to use `/gm level N` and `/gm coin N` |

Characters save every 30 seconds and when a player leaves. Back up `data/characters.json`
to keep them safe. Passwords are stored hashed.

## Running on a server (Debian or Ubuntu)

    curl -fsSL https://raw.githubusercontent.com/ian-dungan/cozy-game/claude/zealous-goldberg-rzi65r/gloamwood/deploy/install.sh | sudo bash

This installs Node.js if needed, puts the game in `/opt/gloamwood`, saves characters in
`/var/lib/gloamwood`, and runs it as the `gloamwood` service on port 8080. Run it again to
update. Prefix options like this: `... | sudo PORT=80 GM_NAMES=yourname bash`.

Without HTTPS, passwords travel unencrypted. For a public address, put a reverse proxy
with a certificate (for example Caddy) in front of it.

## Layout

- `server/server.js` web server, logins, saving
- `server/sim.js` the world: monsters, combat, spells, loot, groups
- `js/data.js`, `js/zones.js` classes, spells, items, monsters, maps (shared by server and browser)
- `js/main.js`, `js/world.js` the browser client
