param([ValidateSet('dev','debug','test','release','check')][string]$Mode='release')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$env:CARGO_TARGET_DIR=Join-Path $root '.local/target'
$localCargo=Join-Path $root '.local/toolchains/cargo/bin/cargo.exe'
if(Test-Path -LiteralPath $localCargo){
 $env:CARGO_HOME=Join-Path $root '.local/toolchains/cargo'
 $env:RUSTUP_HOME=Join-Path $root '.local/toolchains/rustup'
 $env:PATH=(Join-Path $env:CARGO_HOME 'bin')+';'+$env:PATH
 $cargo=$localCargo
}else{
 $cargo=(Get-Command cargo.exe -ErrorAction SilentlyContinue).Source
 if(-not $cargo){throw 'Install the Rust MSVC toolchain first.'}
}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsRoot=if(Test-Path -LiteralPath $vswhere){ & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
if($vsRoot){
 $vcvars=Join-Path $vsRoot 'VC\Auxiliary\Build\vcvars64.bat'
 # vcvars changes the compiler environment only; no file operations use cmd.
 $compilerEnv=& $env:COMSPEC /d /s /c ('""'+$vcvars+'" >nul && set"')
 foreach($line in $compilerEnv){if($line -match '^([^=]+)=(.*)$'){[Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process')}}
}
switch($Mode){
 'test' { & $cargo test --manifest-path src-tauri/Cargo.toml; exit $LASTEXITCODE }
 'check' { & $cargo check --manifest-path src-tauri/Cargo.toml; exit $LASTEXITCODE }
 'dev' { & '.\node_modules\.bin\tauri.cmd' dev; exit $LASTEXITCODE }
 'debug' { & '.\node_modules\.bin\tauri.cmd' build --debug --no-bundle; exit $LASTEXITCODE }
 'release' { & npm.cmd run stage; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}; & '.\node_modules\.bin\tauri.cmd' build; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}; & node scripts/audit-tauri-release.mjs; exit $LASTEXITCODE }
}
