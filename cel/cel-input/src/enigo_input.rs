use crate::inject::{InputController, InputError, MouseButton};
use enigo::{
    Axis, Button, Coordinate, Direction, Enigo, Keyboard as EnigoKeyboard, Mouse as EnigoMouse,
    Settings,
};

/// Cross-platform input controller using enigo.
pub struct EnigoInput {
    enigo: Enigo,
}

impl EnigoInput {
    pub fn new() -> Result<Self, InputError> {
        let settings = Settings::default();
        let enigo = Enigo::new(&settings).map_err(|e| InputError::Failed(e.to_string()))?;
        Ok(Self { enigo })
    }
}

fn map_button(button: MouseButton) -> Button {
    match button {
        MouseButton::Left => Button::Left,
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
    }
}

/// Map a key name string to an enigo Key.
fn parse_key(key: &str) -> Result<enigo::Key, InputError> {
    match key.to_lowercase().as_str() {
        "enter" | "return" => Ok(enigo::Key::Return),
        "tab" => Ok(enigo::Key::Tab),
        "escape" | "esc" => Ok(enigo::Key::Escape),
        "backspace" => Ok(enigo::Key::Backspace),
        "delete" => Ok(enigo::Key::Delete),
        "space" => Ok(enigo::Key::Space),
        "up" => Ok(enigo::Key::UpArrow),
        "down" => Ok(enigo::Key::DownArrow),
        "left" => Ok(enigo::Key::LeftArrow),
        "right" => Ok(enigo::Key::RightArrow),
        "home" => Ok(enigo::Key::Home),
        "end" => Ok(enigo::Key::End),
        "pageup" => Ok(enigo::Key::PageUp),
        "pagedown" => Ok(enigo::Key::PageDown),
        "f1" => Ok(enigo::Key::F1),
        "f2" => Ok(enigo::Key::F2),
        "f3" => Ok(enigo::Key::F3),
        "f4" => Ok(enigo::Key::F4),
        "f5" => Ok(enigo::Key::F5),
        "f6" => Ok(enigo::Key::F6),
        "f7" => Ok(enigo::Key::F7),
        "f8" => Ok(enigo::Key::F8),
        "f9" => Ok(enigo::Key::F9),
        "f10" => Ok(enigo::Key::F10),
        "f11" => Ok(enigo::Key::F11),
        "f12" => Ok(enigo::Key::F12),
        "ctrl" | "control" => Ok(enigo::Key::Control),
        "alt" => Ok(enigo::Key::Alt),
        "shift" => Ok(enigo::Key::Shift),
        "meta" | "super" | "win" | "command" | "cmd" => Ok(enigo::Key::Meta),
        s if s.len() == 1 => Ok(enigo::Key::Unicode(s.chars().next().unwrap())),
        other => Err(InputError::InvalidKey(other.to_string())),
    }
}

impl InputController for EnigoInput {
    fn mouse_move(&mut self, x: i32, y: i32) -> Result<(), InputError> {
        self.enigo
            .move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| InputError::Failed(e.to_string()))
    }

    fn click(&mut self, x: i32, y: i32, button: MouseButton) -> Result<(), InputError> {
        self.mouse_move(x, y)?;
        self.enigo
            .button(map_button(button), Direction::Click)
            .map_err(|e| InputError::Failed(e.to_string()))
    }

    fn double_click(&mut self, x: i32, y: i32, button: MouseButton) -> Result<(), InputError> {
        self.mouse_move(x, y)?;
        let btn = map_button(button);
        self.enigo
            .button(btn, Direction::Click)
            .map_err(|e| InputError::Failed(e.to_string()))?;
        self.enigo
            .button(btn, Direction::Click)
            .map_err(|e| InputError::Failed(e.to_string()))
    }

    fn type_text(&mut self, text: &str) -> Result<(), InputError> {
        self.enigo
            .text(text)
            .map_err(|e| InputError::Failed(e.to_string()))
    }

    fn key_press(&mut self, key: &str) -> Result<(), InputError> {
        let k = parse_key(key)?;
        self.enigo
            .key(k, Direction::Click)
            .map_err(|e| InputError::Failed(e.to_string()))
    }

    fn key_combo(&mut self, keys: &[&str]) -> Result<(), InputError> {
        let parsed: Vec<enigo::Key> = keys.iter().map(|k| parse_key(k)).collect::<Result<_, _>>()?;

        // Press all keys down
        for k in &parsed {
            self.enigo
                .key(*k, Direction::Press)
                .map_err(|e| InputError::Failed(e.to_string()))?;
        }
        // Release in reverse order
        for k in parsed.iter().rev() {
            self.enigo
                .key(*k, Direction::Release)
                .map_err(|e| InputError::Failed(e.to_string()))?;
        }
        Ok(())
    }

    fn scroll(&mut self, dx: i32, dy: i32) -> Result<(), InputError> {
        if dy != 0 {
            self.enigo
                .scroll(dy, Axis::Vertical)
                .map_err(|e| InputError::Failed(e.to_string()))?;
        }
        if dx != 0 {
            self.enigo
                .scroll(dx, Axis::Horizontal)
                .map_err(|e| InputError::Failed(e.to_string()))?;
        }
        Ok(())
    }

    fn display_size(&self) -> Result<(i32, i32), InputError> {
        // enigo's main_display returns (width, height) as (i32, i32)
        let (w, h) = enigo::Mouse::main_display(&self.enigo)
            .map_err(|e| InputError::Failed(e.to_string()))?;
        Ok((w, h))
    }
}
