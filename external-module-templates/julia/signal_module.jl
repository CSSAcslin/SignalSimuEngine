using JSON3

const MODULE_NAME = "julia-gain-template"
const MODULE_VERSION = "1.0.0"

function finite_number(value, fallback = 0.0)
    try
        number = Float64(value)
        return isfinite(number) ? number : fallback
    catch
        return fallback
    end
end

function get_arg_value(flag)
    index = findfirst(==(flag), ARGS)
    if index === nothing || index == length(ARGS)
        error("Missing required argument $(flag).")
    end
    return ARGS[index + 1]
end

function compute(request)
    inputs = get(request, :inputs, [])
    isempty(inputs) && error("At least one input signal is required.")

    source = inputs[1]
    values = get(source, :values, [])
    isempty(values) && error("The first input signal has no values.")

    params = get(request, :params, (;))
    gain = finite_number(get(params, :p0, 1.0), 1.0)
    output_values = [gain * finite_number(value) for value in values]

    return Dict(
        "type" => "signal",
        "values" => output_values,
        "unit" => get(source, :unit, "a.u."),
        "warnings" => [],
        "metadata" => Dict(
            "module" => MODULE_NAME,
            "version" => MODULE_VERSION,
            "operation" => "output = p0 * input_0",
            "gain" => gain,
            "inputId" => get(source, :id, nothing),
            "sampleRate" => get(source, :sampleRate, get(request, :sampleRate, nothing))
        )
    )
end

input_path = get_arg_value("--input")
output_path = get_arg_value("--output")
request = JSON3.read(read(input_path, String))
result = compute(request)
open(output_path, "w") do io
    JSON3.pretty(io, result)
end

