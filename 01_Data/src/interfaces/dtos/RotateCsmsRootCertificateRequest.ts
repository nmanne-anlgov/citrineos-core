// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { type CertificateUseEnumType, DEFAULT_TENANT_ID } from '@citrineos/base';

export class RotateCsmsRootCertificateRequest {
  stationId: string;
  tenantId: number;
  certificateType: CertificateUseEnumType;
  // File id of the new root CA certificate. If not provided, fetched from the external CA.
  newCertificateFileId?: string;

  constructor(
    stationId: string,
    certificateType: CertificateUseEnumType,
    tenantId: number = DEFAULT_TENANT_ID,
    newCertificateFileId?: string,
  ) {
    this.stationId = stationId;
    this.tenantId = tenantId;
    this.certificateType = certificateType;
    this.newCertificateFileId = newCertificateFileId;
  }
}
