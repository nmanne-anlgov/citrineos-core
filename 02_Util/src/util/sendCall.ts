// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  CallAction,
  IMessageConfirmation,
  MessageOrigin,
  OcppRequest,
  OCPPVersion,
  OCPPVersionType,
} from '@citrineos/base';

interface SendCall {
  (
    stationId: string,
    tenantId: number,
    ocppVersion: OCPPVersionType,
    action: CallAction,
    request: OcppRequest,
    callbackUrl?: string,
    correlationId?: string,
    origin?: MessageOrigin,
  ): Promise<IMessageConfirmation>;
}

/** Utility function to package and send a collection of calls using the provided delegate and associated parameters. */
export const packageGroupCall = (
  _sendCall: SendCall,
  identifier: string[],
  tenantId: number,
  ocppVersion: OCPPVersion,
  action: CallAction,
  request: any,
  callbackUrl?: string,
  correlationId?: string,
): Promise<IMessageConfirmation[]> => {
  const results = identifier.map((id) =>
    _sendCall(id, tenantId, ocppVersion, action, request, callbackUrl, correlationId),
  );

  return Promise.all(results);
};
