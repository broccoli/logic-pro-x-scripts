//-----------------------------------------------------------------------------
// Strummer
//-----------------------------------------------------------------------------
/*	


This script creates a strumming attack for sets of simultaneously
played notes.  Can be used for any instrument, such as guitar, harp, etc.

INSTRUCTIONS:
To create a strummed chord, just specify the chord tones and 
the desired duration in the piano roll.  The midi notes must be played
together.  Just use Logic's normal snap function to play notes
simultaneously.

PARAMETERS:
-- Strum Direction: Determines whether strum is up, down, alternating.  If
Following 1/8 or 1/16 is selected, strum will be down except for chords
on the upbeat.
-- Strum Division:  Time between notes.
-- Strum Division Curve:  Negative values speed up the stroke as it plays,
positive values slow it down.
-- Strum Random Division:  Apply randomness to division values.
-- Strum Velocity Curve:   Negative values decrease velocity as chord strums,
positive values increase it.
-- Strum Random Velocity:  Apply randomness to velocity values.
-- Downbeat Accent:  Accent downbeats (on 1/4 or 1/8th note)?
-- Downbeat Accent Amount:  Amount to accent downbeat.
-- First Beat Accent:  Accent first beat of measure?  (If Downbeat also
   accented, the first beat will get extra accent.)
-- First Beat Accent Amount:  Amount to accent first beat.

NOTE:
Logic's sampled instruments can include key off effects at certain
velocities.  For example, a guitar note may have string squeaking.
These effects can be inadvertently introduced in a strum as
velocity increases.

DESCRIPTION:
The script is basically a type of delay -- the initial note in the chord
is played immediately, and the other notes are delayed at increasing
intervals.

All notes on the midi track will be strummed and played, whether or not
the previously played notes have ended.  Single notes will also be 
"strummed", but that won't sound any different.  (For example, you
can do a walking bass with strummed chords on the upbeat.)

ACKNOWLEDGMENT:
Some ideas for this plugin comes from the Guitar Strummer script
included with Scripter, in particular, the strum parameters. The 
complicated code for determining downbeat was copied from there.
Many thanks to the programmer of Guitar Strummer.

*/

var NeedsTimingInfo = true;

var activeNotes = [];

var COLLECTING_NOTES = true;
var CHORD_HAS_PLAYED = false;
var CURRENT_START_BEAT = -1;  // init
var PREVIOUS_STRUM = 1; // initialize as up so first will be down.
var IS_DOWN_BEAT;
var IS_FIRST_BEAT;
var FIRST_BEAT_DEVIATION = .1;

// UI Parameters
var STRUM_DIRECTION;
var STRUM_DIVISION;
var STRUM_DIVISION_CURVE;
var STRUM_RANDOM_DIVISION;
var VELOCITY_DIVISION_CURVE;
var VELOCITY_RANDOM_DIVISION;
var DOWNBEAT_ACCENT;
var DOWNBEAT_ACCENT_AMOUNT;
var FIRST_BEAT_ACCENT;
var FIRST_BEAT_ACCENT_AMOUNT;




//-----------------------------------------------------------------------------
function HandleMIDI(event) {
	/*
		Create an array out of any simultaneouly played notes.
	*/

	var musicInfo = GetTimingInfo();
	
 	if (event instanceof NoteOn) {
		if (activeNotes.length == 0 || musicInfo.blockStartBeat == CURRENT_START_BEAT) {
			activeNotes.push(event);
			CURRENT_START_BEAT = musicInfo.blockStartBeat;
		}
	}
	// pass non-note events through
	else event.send();
	
}

//-----------------------------------------------------------------------------

function ProcessMIDI() {
	/*
		Loop through array of notes and send all of them immediately
		with the right velocity and delay.
	*/

	var musicInfo = GetTimingInfo();
	if (!musicInfo.playing) { 
		// stop all notes if not playing.
		MIDI.allNotesOff();
		
	}

	if (activeNotes.length > 0) {

		STRUM_DIRECTION = GetParameter("Strum Direction");
		STRUM_DIVISION = GetParameter("Strum Division");
		STRUM_DIVISION_CURVE = GetParameter("Strum Division Curve");
		STRUM_RANDOM_DIVISION = GetParameter("Strum Random Division");
		STRUM_VELOCITY_CURVE = GetParameter("Strum Velocity Curve");
		STRUM_RANDOM_VELOCITY = GetParameter("Strum Random Velocity");
		DOWNBEAT_ACCENT = GetParameter("Downbeat Accent");
		DOWNBEAT_ACCENT_AMOUNT = GetParameter("Downbeat Accent Amount");
		FIRST_BEAT_ACCENT = GetParameter("First Beat Accent");
		FIRST_BEAT_ACCENT_AMOUNT = GetParameter("First Beat Accent Amount");




		
		if (STRUM_DIRECTION == 3 || STRUM_DIRECTION == 4) {
			// Follow Beats 1/8 or 1/16
			
			setIsDownBeat(musicInfo);
		}
		
		activeNotes.sort(sortByPitchAscending);
		
		activeNotes = setStrumDirection(activeNotes);
		
		var previousBaseDelay = 0;
		var baseDelay = 0;
		var randomizedDelay = 0;
		var cumDelay = 0;
		var artVanDelay = "Latex"; // unused
		
		for (i=0; i < activeNotes.length; i++) {
			// set note parameters and send at cumulative delay.
			var currentNote = activeNotes[i];
			var noteOn = new NoteOn();
			noteOn.pitch = currentNote.pitch;
			noteOn.velocity = getVelocity(currentNote.velocity, i);
			
			if (i == 0) {
				// send first note with no delay.
				cumDelay = 0;
				baseDelay = 0;
				randomizedDelay = 0;
			}
			else {
				baseDelay = getBaseDelay(previousBaseDelay, i);	
				randomizedDelay = getRandomizedDelay(baseDelay);
			}
			previousBaseDelay = baseDelay;
			cumDelay = cumDelay + randomizedDelay;
			noteOn.sendAfterMilliseconds(cumDelay);
			
		}
		activeNotes = [];
	}
}


//-----------------------------------------------------------------------------
// Helper functions

function sortByPitchAscending(a,b) {
	if (a.pitch < b.pitch) return -1;
	if (a.pitch > b.pitch) return 1;
	return 0;
}

function setStrumDirection(activeNotes) {
	// array of notes comes in DOWN order.
	var strumToPlay;
	
	switch (STRUM_DIRECTION) {
		case 0:						// down
			strumToPlay = 0;
			break;
		case 1:						// up
			strumToPlay = 1;
			break;	
		case 2:						// alternate always
		  strumToPlay = 1 - PREVIOUS_STRUM;
		  PREVIOUS_STRUM = strumToPlay;
		  break
		case 3:						// follow beats 1/8 and 1/16
		case 4:
			if (IS_DOWN_BEAT) {
				strumToPlay = 0;
			}
			else {
				strumToPlay = 1;
			}
			break;
		default:		
			if (true) {
				Trace("error in strum direction");
			}		
	}
	if (strumToPlay == 1) {
		var reverseNotes = [];
		for (i=activeNotes.length-1; i >= 0; i--) {
			reverseNotes.push(activeNotes[i]);
		}
		activeNotes = reverseNotes;
	}
	return activeNotes;
}

function setIsDownBeat(musicInfo) {

	var division = musicInfo.meterNumerator * 128;
	var divisionLength = 1/(division/128);
	var beatToSchedule = 
				Math.ceil(musicInfo.blockStartBeat * division) / division;
	var deviation = beatToSchedule - Math.floor(beatToSchedule);
	
	if (STRUM_DIRECTION == 3) {        //follow beats 1/8
		divisionLength *= 2;
	} 
	else {  													//follow beats 1/16
		if(deviation >= .5) {   
			deviation -= .5;
		}
	}
	var downRange = divisionLength - divisionLength / 2;
	
	if ((deviation <= downRange ) || (deviation >= downRange * 3 )) {
		IS_DOWN_BEAT = true;
	} else {
		IS_DOWN_BEAT = false;
	}
	
var startBeat = musicInfo.blockStartBeat % 4;

if ((startBeat <= 1 + FIRST_BEAT_DEVIATION) ||
			(startBeat >= musicInfo.meterNumerator + 1 - FIRST_BEAT_DEVIATION)) {		
		IS_FIRST_BEAT = true;
	} else {
		IS_FIRST_BEAT = false;
	}

}

function randomInRange (min, max) {
		return Math.random() * (max - min) + min;
}

function getVelocity(velocity, i) {

	velocity = velocity + (i * STRUM_VELOCITY_CURVE);
	
	
	
	if (STRUM_RANDOM_VELOCITY > 0) {
		var maxVelocity = velocity + 
			velocity * STRUM_RANDOM_VELOCITY / 100;
		var minVelocity = velocity - 
			velocity * STRUM_RANDOM_VELOCITY / 100;
		velocity = randomInRange(minVelocity, maxVelocity);
	}

	
	if (DOWNBEAT_ACCENT && IS_DOWN_BEAT) {
		velocity = velocity * (1 + DOWNBEAT_ACCENT_AMOUNT / 100);
	}
	
	if (FIRST_BEAT_ACCENT && IS_FIRST_BEAT) {
		velocity = velocity * (1 + FIRST_BEAT_ACCENT_AMOUNT / 100);
	}

	
	if (velocity > 127) {
		velocity = 127;
	}
	else if (velocity < 1) {
		velocity = 1;
	}
	return velocity;
}


function getBaseDelay(previousBaseDelay, i) {
	if (i == 1) {
		return STRUM_DIVISION;
	}
	return previousBaseDelay + 
		STRUM_DIVISION_CURVE * previousBaseDelay;
}

function getRandomizedDelay(baseDelay) {
	// vary base delay by random amount
	var randomizedDelay = baseDelay;
	if (STRUM_RANDOM_DIVISION > 0) {
		var maxDelay = baseDelay + 
			baseDelay * STRUM_RANDOM_DIVISION / 100;
		var minDelay = baseDelay - 
			baseDelay * STRUM_RANDOM_DIVISION / 100;
		randomizedDelay = randomInRange(minDelay, maxDelay);
	}

	return randomizedDelay;
	
}


//-----------------------------------------------------------------------------
// UI

var DIRECTION_TYPES = [
		"Down",
		"Up",
		"Alternate : Always", 
		"Follow Beats 1/8", 
		"Follow Beats 1/16"
];

var PluginParameters = [{
		name:"Strum Direction",
		type:"menu",
		valueStrings:DIRECTION_TYPES,
		numberOfSteps:DIRECTION_TYPES.length - 1,
		defaultValue:0		
}, {
		name:"Strum Division",
		type:"linear",
		minValue:1,
		maxValue:500, 
		numberOfSteps:499,
		defaultValue:10,
		unit:"ms"
},	 {
		name:"Strum Division Curve",
		type:"linear",
		minValue:-.5,
		maxValue:.5,
		defaultValue:0,
		numberOfSteps:100
}, {
		name:"Strum Random Division",
		type:"linear",
		minValue:0,
		maxValue:100,
		numberOfSteps:100,
		defaultValue:0,
		unit:"%"
}, {
		name:"Strum Velocity Curve",
		type:"linear",
		minValue:-20,
		maxValue:20,
		numberOfSteps:40,
		defaultValue:0
}, {
		name:"Strum Random Velocity",
		type:"linear",
		minValue:0,
		maxValue:50,
		numberOfSteps:50,
		defaultValue:0,
		unit:"%"
}, {
		name:"Downbeat Accent", 
		type:"menu", valueStrings:["No", "Yes"],
		numberOfSteps:2,
		minValue:0,
		maxValue:1,
		defaultValue:0,
}, {
		name:"Downbeat Accent Amount",
		type:"linear",
		minValue:0,
		maxValue:50,
		numberOfSteps:50,
		defaultValue:0,
		unit:"%"
}, {
		name:"First Beat Accent", 
		type:"menu", valueStrings:["No", "Yes"],
		numberOfSteps:2,
		minValue:0,
		maxValue:1,
		defaultValue:0,
}, {
		name:"First Beat Accent Amount",
		type:"linear",
		minValue:0,
		maxValue:50,
		numberOfSteps:50,
		defaultValue:0,
		unit:"%"
}
];
