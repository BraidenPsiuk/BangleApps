(() => {
	const settings: Settings = require("Storage").readJSON("setting.json", true) || { HID: false } as Settings;
	if (settings.HID !== "kbmedia") {
		console.log("widhid: can't enable, HID setting isn't \"kbmedia\"");
		return;
	}
	// @ts-ignore
	delete settings;

	let anchor = {x:0,y:0};
	let start = {x:0,y:0};
	let dragging = false;
	let activeTimeout: number | undefined;
	let waitForRelease = true;

	const onSwipe = ((_lr, ud) => {
		if((Bangle as BangleExt).CLKINFO_FOCUS) return;

		if(!activeTimeout && ud! > 0){
			listen();
			Bangle.buzz(20);
		}
	}) satisfies SwipeCallback;

	const onDrag = (e => {
		if((Bangle as BangleExt).CLKINFO_FOCUS) return;

		if(e.b === 0){
			// released
			const wasDragging = dragging;
			dragging = false;

			if(waitForRelease){
				waitForRelease = false;
				return;
			}

			if(!wasDragging // i.e. tap
			|| (Math.abs(e.x - anchor.x) < 2 && Math.abs(e.y - anchor.y) < 2))
			{
				toggle();
				onEvent();
				return;
			}
		}
		if(waitForRelease) return;

		if(e.b && !dragging){
			dragging = true;
			setStart(e);
			Object.assign(anchor, start);
			return;
		}

		const dx = e.x - start.x;
		const dy = e.y - start.y;

		if(Math.abs(dy) > 25 && Math.abs(dx) > 25){
			// diagonal, ignore
			setStart(e);
			return;
		}

		// had a drag in a single axis
		if(dx > 40){       next(); onEvent(); waitForRelease = true; }
		else if(dx < -40){ prev(); onEvent(); waitForRelease = true; }
		else if(dy > 30){  down(); onEvent(); setStart(e); }
		else if(dy < -30){ up();   onEvent(); setStart(e); }
	}) satisfies DragCallback;

	const setStart = ({ x, y }: { x: number, y: number }) => {
		start.x = x;
		start.y = y;
	};

	const onEvent = () => {
		Bangle.buzz(20); // feedback event sent
		listen(); // had an event, keep listening for more
	};

	const listen = () => {
		const wasActive = !!activeTimeout;
		if(!wasActive){
			suspendOthers();
			waitForRelease = true; // wait for first touch up before accepting gestures
			Bangle.on("drag", onDrag);
			redraw();
		}

		if(activeTimeout) clearTimeout(activeTimeout);
		activeTimeout = setTimeout(() => {
			activeTimeout = undefined;

			Bangle.removeListener("drag", onDrag);
			resumeOthers();

			redraw();
		}, 3000);
	};

	const redraw = () => setTimeout(Bangle.drawWidgets, 50);

	const connected = NRF.getSecurityStatus().connected;
	WIDGETS["hid"] = {
		area: "tr",
		sortorder: -20,
		draw: function() {
			if(this.width === 0) return;
			g.drawImage(
				activeTimeout
				? require("heatshrink").decompress(atob("jEYxH+AEfH44XXAAYXXDKIXZDYp3pC/6KHUMwWHC/4XvUy4YGdqoA/AFoA=="))
				: require("heatshrink").decompress(atob("jEYxH+AEcdjoXXAAYXXDKIXZDYp3pC/6KHUMwWHC/4XvUy4YGdqoA/AFoA==")),
				this.x! + 2,
				this.y! + 2
			);
		},
		width: connected ? 24 : 0,
	};

	if(connected)
		Bangle.on("swipe", onSwipe);
	// @ts-ignore
	delete connected;

	NRF.on("connect", () => {
		WIDGETS["hid"]!.width = 24;
		Bangle.on("swipe", onSwipe);
		redraw();
	});
	NRF.on("disconnect", () => {
		WIDGETS["hid"]!.width = 0;
		Bangle.removeListener("swipe", onSwipe);
		redraw();
	});

	//const DEBUG = true;
	const sendHid = (code: number) => {
		//if(DEBUG) return;
		NRF.sendHIDReport(
			[1, code],
			() => NRF.sendHIDReport([1, 0]),
		);
	};

	const next = () => /*DEBUG ? console.log("next") : */ sendHid(0x01);
	const prev = () => /*DEBUG ? console.log("prev") : */ sendHid(0x02);
	const toggle = () => /*DEBUG ? console.log("toggle") : */ sendHid(0x10);
	const up = () => /*DEBUG ? console.log("up") : */ sendHid(0x40);
	const down = () => /*DEBUG ? console.log("down") : */ sendHid(0x80);

	// similarly to the lightswitch app, we tangle with the listener arrays to
	// disable event handlers
	type Handler = () => void;
	const touchEvents: {
		[key: string]: null | Handler[]
	} = {
		tap: null,
		gesture: null,
		aiGesture: null,
		swipe: null,
		touch: null,
		drag: null,
		stroke: null,
	};

	const suspendOthers = () => {
		for(const event in touchEvents){
			const handlers: Handler[] | Handler | undefined
				= (Bangle as any)[`#on${event}`];

			if(!handlers) continue;

			let newEvents;
			if(handlers instanceof Array)
				newEvents = handlers.slice();
			else
				newEvents = [handlers /* single fn */];

			for(const handler of newEvents)
				Bangle.removeListener(event, handler);

			touchEvents[event] = newEvents;
		}
	};
	const resumeOthers = () => {
		for(const event in touchEvents){
			const handlers = touchEvents[event];
			touchEvents[event] = null;

			if(handlers)
				for(const handler of handlers)
					try{
						Bangle.on(event as any, handler);
					}catch(e){
						console.log(`couldn't restore "${event}" handler:`, e);
					}
		}
	};
})()
