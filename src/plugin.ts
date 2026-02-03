// Allow self-signed certificates (common for on-premise Centreon instances)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import streamDeck from "@elgato/streamdeck";
import { SingleAlert } from "./actions/single-alert";
import { DualAlert } from "./actions/dual-alert";

streamDeck.actions.registerAction(new SingleAlert());
streamDeck.actions.registerAction(new DualAlert());

streamDeck.connect();
