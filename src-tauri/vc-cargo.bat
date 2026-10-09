@echo off
rem 在 VS 编译环境下运行 cargo（避免 Git Bash 里 GNU link.exe 抢占 MSVC linker）
call "E:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
set RUSTUP_HOME=F:\rustup
set CARGO_HOME=F:\cargo
set PATH=F:\cargo\bin;%PATH%
cd /d "%~dp0"
cargo %*
