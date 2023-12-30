STATE=$(shell endo where state)
PET=$(STATE)/pet-store

# ag-trade package is currently in finquick
# https://github.com/dckc/finquick
AG_TRADE=~/projects/finquick/packages/ag-trade

reserve-add: reserve-add.js $(PET)/alice
	endo run reserve-add.js 1 IST -p alice

$(PET)/alice: $(PET)/alice-wk $(PET)/fresh-trade-id
	endo mkguest alice

	endo send alice @wallet:alice-wk
	endo send alice @fresh:fresh-trade-id
	endo inbox --as alice
	# these 0/1 message numbers are fragile
	endo adopt 0 wallet --as alice
	endo adopt 1 fresh --as alice

$(PET)/fresh-trade-id: $(PET)/fresh
	endo eval "E(fresh).start('trade-')" fresh -n fresh-trade-id

# making fresh IDs requires non-deterministic inputs
$(PET)/fresh: fresh-id.js
	endo make --UNSAFE fresh-id.js -n fresh

# in makeWalletKit, it's too easy to get the rpc, lcd order wrong. should be named
$(PET)/alice-wk: $(PET)/local $(PET)/client-maker
	endo eval "E(wf).makeWalletKit('${ALICE_SECRET}', local.rpc, local.lcd)" \
		local wf:client-maker -n alice-wk

$(PET)/local: net-local.js $(PET)/cosmos-fetch
	endo make net-local.js -n local -p cosmos-fetch

# plugins from ag-trade
$(PET)/client-maker:
	make -C $(AG_TRADE) $@

$(PET)/cosmos-fetch:
	make -C $(AG_TRADE) $@
