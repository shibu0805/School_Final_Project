type Profile={county?:string;group?:string;activity?:string;activitySource?:'explicit'|'inherited'|'unspecified';intensity?:string;duration?:number;time?:string;timeDetail?:string};
export const CHAT_INTENT_VERSION:string;
export function findCounty(message:unknown):string|undefined;
export function isAirQualityMessage(message:unknown,context?:Profile):boolean;
export function isLocationFollowup(message:unknown,context?:Profile):boolean;
export function unrecognizedMessage(profile?:Profile):{
 reply:string;profile:Profile;status:'clarification';clarificationReason:'unrecognized_message';
 assessment:{status:'insufficient';label:string};actions:string[];
};
