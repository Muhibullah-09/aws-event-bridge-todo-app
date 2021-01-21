import React from "react";
import AmplifyClient from "./client";
import IdentityProvider from '../../Identity-Context.js';

export default ({ element }) => <AmplifyClient><IdentityProvider>{element}</IdentityProvider></AmplifyClient>