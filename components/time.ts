import moment from 'moment';

export function formatWatTimestamp(value: string | Date, format = 'MMM D, YYYY HH:mm'): string {
  return moment(value).utcOffset(60).format(format);
}
