// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { type CertificateUseEnumType, OCPPVersion } from '@citrineos/base';

export class InstallRootCertificateRequest {
  // Fields for InstallCertificate message request
  stationId: string;
  certificateType: CertificateUseEnumType;
  tenantId: number;
  callbackUrl?: string;
  // The file id of the root CA certificate. If not provided, it uses one from the external CA Server
  // according to the certificate type, e.g., lets encrypt, hubject.
  fileId?: string;
  version?: OCPPVersion;

  constructor(
    stationId: string,
    tenantId: number,
    certificateType: CertificateUseEnumType,
    callbackUrl?: string,
    fileId?: string,
    version?: OCPPVersion,
  ) {
    this.stationId = stationId;
    this.tenantId = tenantId;
    this.certificateType = certificateType;
    this.callbackUrl = callbackUrl;
    this.fileId = fileId;
    this.version = version;
  }
}
