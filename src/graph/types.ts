export interface GraphCalendar {
  id: string;
  name: string;
  color?: string;
  canEdit?: boolean;
  isDefaultCalendar?: boolean;
  owner?: { name?: string; address?: string };
}

export interface GraphDateTimeTimeZone {
  dateTime: string;
  timeZone: string;
}

export interface GraphAttendee {
  emailAddress: { address: string; name?: string };
  type?: 'required' | 'optional' | 'resource';
}

export interface GraphEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  body?: { contentType: 'text' | 'html'; content: string };
  start: GraphDateTimeTimeZone;
  end: GraphDateTimeTimeZone;
  location?: { displayName?: string };
  attendees?: GraphAttendee[];
  organizer?: { emailAddress: { address: string; name?: string } };
  isCancelled?: boolean;
  webLink?: string;
}

export interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export interface GraphErrorBody {
  error?: { code?: string; message?: string };
}
