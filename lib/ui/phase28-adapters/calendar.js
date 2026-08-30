'use strict';

const calendarCenter=require('../../calendar/calendar-center.js');

function buildPhase28CalendarModel(data={}){
  return calendarCenter.buildPhase28CalendarModel({
    entries:data.calendarEntries||[],generatedAt:data.generatedAt,month:data.calendarRange?.month,error:data.calendarError||null
  });
}

module.exports={buildPhase28CalendarModel};
