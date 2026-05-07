// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('CertificateRotationAttempts', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    stationId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'ChargingStations',
        key: 'id',
      },
    },
    certificateType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    newCertificateFileId: {
      type: DataTypes.STRING,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Pending',
    },
    oldCertHashData: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    },
    pendingDeletes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Tenants',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('CertificateRotationAttempts');
}
