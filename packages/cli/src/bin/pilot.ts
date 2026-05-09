#!/usr/bin/env node
// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { buildProgram } from '../program.js';

await buildProgram().parseAsync();
