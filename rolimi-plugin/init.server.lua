--[[
	ROLimi Plugin for Roblox Studio
	Интеграция с LimiAI через MCP-протокол
	
	Установка:
	1. Создай папку в Studio: Plugin → Plugins → ROLimi
	2. Скопируй этот файл как init.server.lua
	3. Перезапусти Studio
	
	Или используй модель Plugin:
	1. Создай новый Plugin в Studio
	2. Вставь код
	3. Опубликуй как локальный плагин
--]]

local ROLimi = {}

-- Конфигурация
local CONFIG = {
	PORT = 20129,
	RECONNECT_INTERVAL = 3,
	TIMEOUT = 30,
	VERSION = "1.0.0"
}

-- Состояние
local socket = nil
local connected = false
local toolbar = nil
local connectButton = nil
local statusDisplay = nil

-- Вспомогательные функции
local function jsonEncode(tbl)
	-- Простой JSON encoder без внешних зависимостей
	local function encodeValue(val)
		if type(val) == "string" then
			return '"' .. val:gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r') .. '"'
		elseif type(val) == "number" then
			return tostring(val)
		elseif type(val) == "boolean" then
			return val and "true" or "false"
		elseif type(val) == "table" then
			if next(val) == nil then
				return "[]"
			end
			-- Проверяем, массив или объект
			local isArray = true
			local maxIndex = 0
			for k, v in pairs(val) do
				if type(k) ~= "number" or k <= 0 or math.floor(k) ~= k then
					isArray = false
					break
				end
				if k > maxIndex then maxIndex = k end
			end
			
			if isArray then
				local parts = {}
				for i = 1, maxIndex do
					parts[i] = encodeValue(val[i])
				end
				return "[" .. table.concat(parts, ",") .. "]"
			else
				local parts = {}
				for k, v in pairs(val) do
					table.insert(parts, '"' .. tostring(k) .. '":' .. encodeValue(v))
				end
				return "{" .. table.concat(parts, ",") .. "}"
			end
		elseif val == nil then
			return "null"
		else
			return '"' .. tostring(val) .. '"'
		end
	end
	return encodeValue(tbl)
end

local function parsePath(path)
	-- Парсит путь типа "Workspace.Model.Part" в объект
	local parts = {}
	for part in string.gmatch(path, "[^%.]+") do
		table.insert(parts, part)
	end
	
	if #parts == 0 then return nil end
	
	-- Первый сегмент — сервис
	local obj = game:FindService(parts[1]) or game:GetService(parts[1])
	if not obj then return nil end
	
	-- Остальные сегменты — дочерние объекты
	for i = 2, #parts do
		obj = obj:FindFirstChild(parts[i])
		if not obj then return nil end
	end
	
	return obj
end

local function getPath(obj)
	-- Получает путь объекта в формате "Service.Parent.Child"
	if not obj then return nil end
	
	local parts = {}
	local current = obj
	
	while current and current ~= game do
		table.insert(parts, 1, current.Name)
		current = current.Parent
	end
	
	return table.concat(parts, ".")
end

local function serializeProperties(obj, props)
	-- Сериализует указанные свойства объекта
	local result = {}
	for _, prop in ipairs(props) do
		local value = obj[prop]
		if value ~= nil then
			if type(value) == "Vector3" then
				result[prop] = { x = value.X, y = value.Y, z = value.Z, _type = "Vector3" }
			elseif type(value) == "Color3" then
				result[prop] = { r = value.R, g = value.G, b = value.B, _type = "Color3" }
			elseif type(value) == "UDim2" then
				result[prop] = { 
					X = { Scale = value.X.Scale, Offset = value.X.Offset },
					Y = { Scale = value.Y.Scale, Offset = value.Y.Offset },
					_type = "UDim2"
				}
			elseif type(value) == "UDim" then
				result[prop] = { Scale = value.Scale, Offset = value.Offset, _type = "UDim" }
			elseif type(value) == "EnumItem" then
				result[prop] = { Name = value.Name, Value = value.Value, _type = "Enum" }
			elseif typeof(value) == "Instance" then
				result[prop] = getPath(value)
			elseif type(value) ~= "function" then
				result[prop] = value
			end
		end
	end
	return result
end

-- Обработчики инструментов
local ToolHandlers = {}

function ToolHandlers.rolox_script_create(params)
	local parent = parsePath(params.parent or "ServerScriptService")
	if not parent then
		return { error = "Родительский объект не найден: " .. (params.parent or "ServerScriptService") }
	end
	
	local script = Instance.new("Script")
	script.Name = params.name or "NewScript"
	script.Source = params.source or ""
	script.Parent = parent
	
	return { 
		success = true, 
		path = getPath(script),
		name = script.Name
	}
end

function ToolHandlers.rolox_script_edit(params)
	local script = parsePath(params.path)
	if not script then
		return { error = "Скрипт не найден: " .. params.path }
	end
	
	if not script:IsA("Script") and not script:IsA("LocalScript") and not script:IsA("ModuleScript") then
		return { error = "Объект не является скриптом: " .. params.path }
	end
	
	script.Source = params.source or ""
	
	return { success = true, path = params.path }
end

function ToolHandlers.rolox_script_read(params)
	local script = parsePath(params.path)
	if not script then
		return { error = "Скрипт не найден: " .. params.path }
	end
	
	if not script:IsA("Script") and not script:IsA("LocalScript") and not script:IsA("ModuleScript") then
		return { error = "Объект не является скриптом: " .. params.path }
	end
	
	return { 
		success = true, 
		path = params.path,
		name = script.Name,
		source = script.Source
	}
end

function ToolHandlers.rolox_script_delete(params)
	local script = parsePath(params.path)
	if not script then
		return { error = "Скрипт не найден: " .. params.path }
	end
	
	script:Destroy()
	return { success = true }
end

function ToolHandlers.rolox_object_create(params)
	local parent = parsePath(params.parent or "Workspace")
	if not parent then
		return { error = "Родительский объект не найден: " .. (params.parent or "Workspace") }
	end
	
	local success, obj = pcall(function()
		return Instance.new(params.className)
	end)
	
	if not success then
		return { error = "Не удалось создать объект типа " .. params.className }
	end
	
	obj.Name = params.name or params.className
	obj.Parent = parent
	
	-- Установка свойств
	if params.properties then
		for prop, value in pairs(params.properties) do
			pcall(function()
				if type(value) == "table" then
					if value._type == "Vector3" then
						obj[prop] = Vector3.new(value.x or 0, value.y or 0, value.z or 0)
					elseif value._type == "Color3" then
						obj[prop] = Color3.new(value.r or 0, value.g or 0, value.b or 0)
					elseif value._type == "UDim2" then
						obj[prop] = UDim2.new(
							value.X.Scale or 0, value.X.Offset or 0,
							value.Y.Scale or 0, value.Y.Offset or 0
						)
					else
						obj[prop] = value
					end
				else
					obj[prop] = value
				end
			end)
		end
	end
	
	return {
		success = true,
		path = getPath(obj),
		name = obj.Name,
		className = obj.ClassName
	}
end

function ToolHandlers.rolox_object_get(params)
	local obj = parsePath(params.path)
	if not obj then
		return { error = "Объект не найден: " .. params.path }
	end
	
	local children = {}
	for _, child in ipairs(obj:GetChildren()) do
		table.insert(children, {
			name = child.Name,
			className = child.ClassName,
			path = getPath(child)
		})
	end
	
	local props = serializeProperties(obj, {
		"Name", "ClassName", "Position", "Size", "Color", "Transparency",
		"Anchored", "CanCollide", "Visible", "Enabled"
	})
	
	return {
		success = true,
		path = params.path,
		name = obj.Name,
		className = obj.ClassName,
		properties = props,
		children = children
	}
end

function ToolHandlers.rolox_object_set(params)
	local obj = parsePath(params.path)
	if not obj then
		return { error = "Объект не найден: " .. params.path }
	end
	
	for prop, value in pairs(params.properties or {}) do
		pcall(function()
			if type(value) == "table" then
				if value._type == "Vector3" then
					obj[prop] = Vector3.new(value.x or 0, value.y or 0, value.z or 0)
				elseif value._type == "Color3" then
					obj[prop] = Color3.new(value.r or 0, value.g or 0, value.b or 0)
				elseif value._type == "UDim2" then
					obj[prop] = UDim2.new(
						value.X.Scale or 0, value.X.Offset or 0,
						value.Y.Scale or 0, value.Y.Offset or 0
					)
				elseif value._type == "Enum" then
					local enum = Enum[prop:gsub("^%l", string.upper)]
					if enum then
						obj[prop] = enum[value.Name] or enum[value.Value]
					end
				else
					obj[prop] = value
				end
			else
				obj[prop] = value
			end
		end)
	end
	
	return { success = true, path = params.path }
end

function ToolHandlers.rolox_object_delete(params)
	local obj = parsePath(params.path)
	if not obj then
		return { error = "Объект не найден: " .. params.path }
	end
	
	obj:Destroy()
	return { success = true }
end

function ToolHandlers.rolox_object_list(params)
	local container = parsePath(params.path or "Workspace")
	if not container then
		return { error = "Контейнер не найден: " .. (params.path or "Workspace") }
	end
	
	local children = {}
	for _, child in ipairs(container:GetChildren()) do
		table.insert(children, {
			name = child.Name,
			className = child.ClassName,
			path = getPath(child)
		})
	end
	
	return {
		success = true,
		path = params.path or "Workspace",
		count = #children,
		children = children
	}
end

function ToolHandlers.rolox_instance_find(params)
	local searchIn = parsePath(params.searchIn or "Workspace")
	if not searchIn then
		return { error = "Объект для поиска не найден: " .. (params.searchIn or "Workspace") }
	end
	
	local results = {}
	local query = string.lower(params.query or "")
	
	for _, child in ipairs(searchIn:GetDescendants()) do
		local matches = false
		
		if query and string.find(string.lower(child.Name), query, 1, true) then
			matches = true
		end
		
		if params.className and child.ClassName == params.className then
			matches = true
		end
		
		if matches then
			table.insert(results, {
				name = child.Name,
				className = child.ClassName,
				path = getPath(child)
			})
		end
	end
	
	return {
		success = true,
		query = params.query,
		count = #results,
		results = results
	}
end

function ToolHandlers.rolox_play_start(params)
	game:GetService("TestService"):Run()
	return { success = true, status = "playing" }
end

function ToolHandlers.rolox_play_stop(params)
	game:GetService("TestService"):Stop()
	return { success = true, status = "stopped" }
end

function ToolHandlers.rolox_play_pause(params)
	game:GetService("TestService"):Pause()
	return { success = true, status = "paused" }
end

function ToolHandlers.rolox_console_log(params)
	local message = params.message or ""
	local level = params.level or "info"
	
	if level == "error" then
		warn("[ROLimi] " .. message)
	elseif level == "warn" then
		warn("[ROLimi] " .. message)
	else
		print("[ROLimi] " .. message)
	end
	
	return { success = true }
end

function ToolHandlers.rolox_explorer_select(params)
	local obj = parsePath(params.path)
	if not obj then
		return { error = "Объект не найден: " .. params.path }
	end
	
	game:GetService("Selection"):Set({ obj })
	return { success = true, path = params.path }
end

function ToolHandlers.rolox_project_save(params)
	game:Save()
	return { success = true }
end

function ToolHandlers.rolox_camera_set(params)
	local camera = game:GetService("Workspace").CurrentCamera
	if not camera then
		return { error = "Камера не найдена" }
	end
	
	if params.position then
		camera.CFrame = CFrame.new(
			Vector3.new(params.position.x or 0, params.position.y or 0, params.position.z or 0),
			Vector3.new(params.lookAt.x or 0, params.lookAt.y or 0, params.lookAt.z or 0)
		)
	end
	
	return { success = true }
end

function ToolHandlers.rolox_selection_get(params)
	local selection = game:GetService("Selection"):Get()
	local results = {}
	
	for _, obj in ipairs(selection) do
		table.insert(results, {
			name = obj.Name,
			className = obj.ClassName,
			path = getPath(obj)
		})
	end
	
	return {
		success = true,
		count = #results,
		selection = results
	}
end

function ToolHandlers.rolox_gui_create(params)
	return ToolHandlers.rolox_object_create(params)
end

function ToolHandlers.rolox_property_set(params)
	local obj = parsePath(params.path)
	if not obj then
		return { error = "Объект не найден: " .. params.path }
	end
	
	local value = params.value
	pcall(function()
		if type(value) == "table" then
			if value._type == "Vector3" then
				obj[params.property] = Vector3.new(value.x or 0, value.y or 0, value.z or 0)
			elseif value._type == "Color3" then
				obj[params.property] = Color3.new(value.r or 0, value.g or 0, value.b or 0)
			elseif value._type == "UDim2" then
				obj[params.property] = UDim2.new(
					value.X.Scale or 0, value.X.Offset or 0,
					value.Y.Scale or 0, value.Y.Offset or 0
				)
			else
				obj[params.property] = value
			end
		else
			obj[params.property] = value
		end
	end)
	
	return { success = true, path = params.path, property = params.property }
end

-- WebSocket подключение
local function connectToServer()
	if socket then
		socket:close()
		socket = nil
	end
	
	-- Используем Roblox WebSocket API
	local url = "ws://127.0.0.1:" .. CONFIG.PORT .. "/roblox"
	
	local success, result = pcall(function()
		return WebSocket.connect(url)
	end)
	
	if not success then
		warn("[ROLimi] Не удалось подключиться:", result)
		connected = false
		updateUI()
		return false
	end
	
	socket = result
	connected = true
	updateUI()
	
	print("[ROLimi] Подключено к LimiAI на порту", CONFIG.PORT)
	
	socket.OnMessage:Connect(function(message)
		-- Обрабатываем входящее сообщение
		local success, data = pcall(function()
			return game:GetService("HttpService"):JSONDecode(message)
		end)
		
		if not success then
			warn("[ROLimi] Ошибка парсинга JSON:", data)
			return
		end
		
		-- Выполняем инструмент
		local method = data.method
		local params = data.params or {}
		local id = data.id
		
		local handler = ToolHandlers[method]
		local result
		
		if handler then
			local success, res = pcall(handler, params)
			if success then
				result = { id = id, result = res }
			else
				result = { id = id, error = res }
			end
		else
			result = { id = id, error = "Неизвестный метод: " .. method }
		end
		
		-- Отправляем ответ
		if socket then
			socket:Send(game:GetService("HttpService"):JSONEncode(result))
		end
	end)
	
	socket.OnClose:Connect(function()
		connected = false
		socket = nil
		updateUI()
		print("[ROLimi] Соединение закрыто")
		
		-- Автопереподключение
		wait(CONFIG.RECONNECT_INTERVAL)
		if not connected then
			connectToServer()
		end
	end)
	
	return true
end

-- UI
function updateUI()
	if connectButton then
		if connected then
			connectButton.Text = "● Подключено"
			connectButton.TextColor3 = Color3.fromRGB(100, 200, 100)
		else
			connectButton.Text = "○ Подключиться"
			connectButton.TextColor3 = Color3.fromRGB(200, 100, 100)
		end
	end
	
	if statusDisplay then
		statusDisplay.Text = connected and "ROLimi v" .. CONFIG.VERSION .. " ●" or "ROLimi v" .. CONFIG.VERSION .. " ○"
		statusDisplay.TextColor3 = connected and Color3.fromRGB(100, 200, 100) or Color3.fromRGB(200, 100, 100)
	end
end

-- Инициализация плагина
function ROLimi.init(plugin)
	-- Создаём тулбар
	toolbar = plugin:CreateToolbar("ROLimi")
	
	-- Кнопка подключения
	connectButton = toolbar:CreateButton(
		"ROLimi",
		"Подключиться к LimiAI",
		"rbxassetid://4458901886" -- Иконка (можно заменить)
	)
	connectButton.Click:Connect(function()
		if not connected then
			connectToServer()
		else
			if socket then
				socket:close()
			end
			connected = false
			updateUI()
		end
	end)
	
	-- Статус
	statusDisplay = toolbar:CreateButton(
		"ROLimi Status",
		"Статус подключения",
		""
	)
	statusDisplay.Clickable = false
	
	updateUI()
	
	-- Автоподключение при старте
	spawn(function()
		wait(1)
		connectToServer()
	end)
end

-- Запуск
ROLimi.init(plugin())

print("[ROLimi] Плагин загружен. Версия " .. CONFIG.VERSION)
