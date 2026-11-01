-- Conservative starting profile. No emergency access or speed exemptions.
-- Changes require re-extraction. Emergency-specific ranking lives in Python.
-- Source: OSRM v5.27.1 profiles/car.lua (setup and driving-side properties).
package.path = '/opt/?.lua;' .. package.path
local car = dofile('/opt/car.lua')
local car_setup = car.setup
car.setup = function()
    local profile = car_setup()
    profile.properties.left_hand_driving = true -- Kochi, India
    return profile
end
return car
