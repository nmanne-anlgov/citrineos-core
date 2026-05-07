// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { SequelizeRepository } from './Base.js';
import type { ICertificateRotationAttemptRepository } from '../../../interfaces/index.js';
import type { BootstrapConfig } from '@citrineos/base';
import { Sequelize } from 'sequelize-typescript';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { CertificateRotationAttempt } from '../model/index.js';

export class SequelizeCertificateRotationAttemptRepository
  extends SequelizeRepository<CertificateRotationAttempt>
  implements ICertificateRotationAttemptRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, CertificateRotationAttempt.MODEL_NAME, logger, sequelizeInstance);
  }
}
