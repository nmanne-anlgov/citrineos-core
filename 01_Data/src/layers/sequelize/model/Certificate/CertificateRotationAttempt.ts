// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import {
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import {
  DEFAULT_TENANT_ID,
  OCPP2_Namespace,
  type CertificateUseEnumType,
  type TenantDto,
} from '@citrineos/base';
import { ChargingStation } from '../Location/index.js';
import { Tenant } from '../Tenant.js';

export enum CertificateRotationStatusEnum {
  Pending = 'Pending',
  Discovering = 'Discovering',
  Installing = 'Installing',
  Deleting = 'Deleting',
  Done = 'Done',
  Failed = 'Failed',
}

@Table
export class CertificateRotationAttempt extends Model {
  static readonly MODEL_NAME: string = OCPP2_Namespace.CertificateRotationAttempt;

  @ForeignKey(() => ChargingStation)
  @Column({
    type: DataType.STRING(36),
    allowNull: false,
  })
  declare stationId: string;

  @BelongsTo(() => ChargingStation)
  station?: ChargingStation;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare certificateType: CertificateUseEnumType;

  @Column({
    type: DataType.STRING,
  })
  declare newCertificateFileId?: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: CertificateRotationStatusEnum.Pending,
  })
  declare status: CertificateRotationStatusEnum;

  // JSON array of CertificateHashData objects discovered in step 1 (GetInstalledCertificateIds).
  // Used in step 3 to issue DeleteCertificate for each old cert.
  @Column({
    type: DataType.TEXT,
    get() {
      const raw = this.getDataValue('oldCertHashData');
      return raw ? JSON.parse(raw) : [];
    },
    set(value: object[]) {
      this.setDataValue('oldCertHashData', JSON.stringify(value));
    },
  })
  declare oldCertHashData: object[];

  // Tracks how many DeleteCertificate calls are still pending completion.
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare pendingDeletes: number;

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant)
  declare tenant?: TenantDto;

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: CertificateRotationAttempt) {
    if (instance.tenantId == null) {
      instance.tenantId = DEFAULT_TENANT_ID;
    }
  }

  constructor(...args: any[]) {
    super(...args);
    if (this.tenantId == null) {
      this.tenantId = DEFAULT_TENANT_ID;
    }
  }
}
