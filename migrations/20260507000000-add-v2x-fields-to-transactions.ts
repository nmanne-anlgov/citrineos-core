// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/** @type {import('sequelize-cli').Migration} */
import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn('Transactions', 'allowedEnergyTransfer', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'evccId', {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn('Transactions', 'evccId');
    await queryInterface.removeColumn('Transactions', 'allowedEnergyTransfer');
  },
};
