# ttGamba
This is a user-app for Transport Tycoon on FiveM.

## What is a Transport Tycoon User App?
Transport Tycoon is a FiveM server.
A user app is a custom application that can load a remote page in an iframe/web embed on
the screen while you're in game.

When the user app loads, it will use the entire screen viewport so it's **IMPORTANT** to
make the app with a floating window design, considering usability over window size.

You can view documentation for making a user app at: https://ttycoon.eu/userapps/docs

## What is this app?
ttGamba is a next.js-based gambling app for in-game money only.
It does **NOT** allow Real Money Trading and does **NOT** promote donating anything outside
of in-game items, or paying for addons within the app using in-game currency.

Once the intended user base has gone through the deposit flow, which requires interaction
with a 'banker' who is listed as a member of the app's maintenance team, the chips (app currency)
will be applied to the user's account and they can use it across the various activities within
the userapp.

The app is designed to be a casino, where users can play multiplayer games from Blackjack &
Baccarat, to singleplayer games like Chicken Road Game, Slots, Roulette and more.

The app is focussed around providing a multiple user experience, but will also allow players
to purchase addons and licenses such as the solo table upgrade, to allow them to enter multiplayer
game lobbies capped at one player so that they don't have to wait for other players to be able to
bet on a round of blackjack, for example. Actual singleplayer games do not have this feature as
there is no ability to wait anyway, as games start on demand.

## How to trigger actions
In the userapp docs you may have noticed it provides a list of actions that you can use to
trigger various in game actions such as notices, sound effects, and game controls. A rough
example on triggering those would be:

```js
        // Example button actions showcasing what can be done
        const actions = [
            {
                name: "Paleto Bay",
                action: {type: "setWaypoint", x: -267, y: 6231},
            },
            {
                name: "Faction Menu",
                action: {type: "sendCommand", command: "faction"},
            },
            {
                name: "Open Trunk",
                action: {type: "sendCommand", command: "rm_trunk"},
            },
            {
                name: "Sample Notification",
                action: {type: "notification", text: "Hello, World!"},
            },
            {
                name: "Sample Popup",
                action: {type: "popup", title: "Title", text: "Hello, World!"},
            },
            {
                name: "Sample Oneliner",
                action: {type: "oneliner", text: "Hello, World!"},
            },
            {
                name: "Sample Message",
                action: {type: "message", text: "Hello, World!"},
            },
            {
                name: "Sample Info",
                action: {type: "info", text: "Hello, World!", time: 10},
            }
        ];

        for (const action of actions) {
            const button = document.createElement("button");
            button.textContent = action.name;
            button.onclick = () => {
                window.parent.postMessage(action.action, "*");
            };
            document.querySelector("#buttons").appendChild(button);
        }

        // It is recommended to have a button to close the window
        // This is a simple example of how to do it
        const escapeListener = (e) => {
            if (e.key === "Escape") {
                // Pin the window, meaning we give control back to the game
                window.parent.postMessage({type: "pin"}, "*");
            }
        };
        window.addEventListener('keydown', escapeListener);
```

Not every action is detailed above, but the key thing to take away is that to trigger
an action on the game client via a userapp, the intention is for you to use the line:

`window.parent.postMessage(action, "*");`

`*` is the targetOrigin so that it targets all open popups, including the game client
which should be your intended use if you're reaching for a postMessage with the intention
of sending a message to the game client to control or change something.
