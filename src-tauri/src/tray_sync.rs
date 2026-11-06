#[derive(Clone, Copy, PartialEq, Eq)]
pub struct MenuState {
    pub pinned: bool,
    pub private: bool,
}

#[derive(Default)]
pub struct MenuSync {
    last_success: Option<MenuState>,
}
impl MenuSync {
    pub fn invalidate(&mut self) { self.last_success = None; }
    pub fn sync<E>(&mut self, state: MenuState, install: impl FnOnce() -> Result<(), E>) -> Result<bool, E> {
        if self.last_success == Some(state) { return Ok(false); }
        // A failed installation leaves native menu state uncertain, including checkmarks
        // changed by clicking the native menu. Retry at the next real sync opportunity.
        self.last_success = None;
        install()?;
        self.last_success = Some(state);
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installs_once_and_only_changes_for_displayed_checkmarks() {
        let mut sync=MenuSync::default();let mut calls=0;
        let mut state=MenuState{pinned:true,private:false};
        assert!(sync.sync(state,||{calls+=1;Ok::<_,()>(())}).unwrap());
        for _ in 0..20 { assert!(!sync.sync(state,||{calls+=1;Ok::<_,()>(())}).unwrap()); }
        state.private=true;
        assert!(sync.sync(state,||{calls+=1;Ok::<_,()>(())}).unwrap());
        state.pinned=false;
        assert!(sync.sync(state,||{calls+=1;Ok::<_,()>(())}).unwrap());
        assert_eq!(calls,3);
    }
    #[test]
    fn failure_does_not_mark_success_and_returning_to_prior_state_reinstalls() {
        let mut sync=MenuSync::default();let a=MenuState{pinned:true,private:false};
        let b=MenuState{private:true,..a};
        assert!(sync.sync(a,||Err("creation failed")).is_err());
        assert!(sync.sync(a,||Ok::<_,&str>(())).unwrap());
        assert!(sync.sync(b,||Err("installation failed")).is_err());
        assert!(sync.sync(a,||Ok::<_,&str>(())).unwrap());
        assert!(!sync.sync::<()>(a,||panic!("must not recreate")).unwrap());
    }
    #[test]
    fn native_click_invalidates_checkmarks_even_if_the_preference_write_fails() {
        let mut sync=MenuSync::default();let a=MenuState{pinned:true,private:false};
        assert!(sync.sync(a,||Ok::<_,()>(())).unwrap());
        sync.invalidate();
        assert!(sync.sync(a,||Ok::<_,()>(())).unwrap());
    }
}
