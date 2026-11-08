package dev.blockport.launcher

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlin.math.roundToInt
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.blockport.core.VersionEntry

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LauncherApp(vm: LauncherViewModel) {
    MaterialTheme(colorScheme = darkColorScheme()) {
        var tab by remember { mutableIntStateOf(0) }
        Scaffold(topBar = { TopAppBar(title = { Text("BlockPort") }) }) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                TabRow(selectedTabIndex = tab) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Versões") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Desempenho") })
                }
                if (tab == 0) VersionsTab(vm) else PerformanceTab(vm)
            }
        }

        vm.launchReport?.let { report ->
            AlertDialog(
                onDismissRequest = { vm.launchReport = null },
                confirmButton = { TextButton(onClick = { vm.launchReport = null }) { Text("OK") } },
                title = { Text("Não foi possível iniciar") },
                text = {
                    SelectionContainer {
                        Text(report, Modifier.verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodySmall)
                    }
                },
            )
        }
    }
}

@Composable
private fun VersionsTab(vm: LauncherViewModel) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = vm.playerName, onValueChange = { vm.playerName = it },
            label = { Text("Nome do jogador (perfil local)") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = vm.query, onValueChange = { vm.query = it },
                label = { Text("Buscar versão") }, singleLine = true, modifier = Modifier.weight(1f),
            )
            FilterChip(selected = vm.showSnapshots, onClick = { vm.showSnapshots = !vm.showSnapshots }, label = { Text("Snapshots") })
        }
        vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        vm.progress?.let {
            Column {
                Text("${it.phase}: ${it.done}/${it.total}", style = MaterialTheme.typography.bodySmall)
                LinearProgressIndicator(progress = { it.fraction }, modifier = Modifier.fillMaxWidth())
            }
        }
        if (vm.loading) {
            CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(vm.visibleVersions(), key = { it.id }) { VersionRow(vm, it) }
            }
        }
    }
}

@Composable
private fun VersionRow(vm: LauncherViewModel, entry: VersionEntry) {
    val isInstalled = entry.id in vm.installed
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(12.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(entry.id, style = MaterialTheme.typography.titleMedium)
                Text(entry.type, style = MaterialTheme.typography.bodySmall)
            }
            val busyHere = vm.busy == entry.id
            if (isInstalled) {
                Button(onClick = { vm.play(entry) }, enabled = vm.busy == null) {
                    Text(if (busyHere) "Iniciando…" else "Jogar")
                }
            } else {
                OutlinedButton(onClick = { vm.install(entry) }, enabled = vm.busy == null) {
                    Text(if (busyHere) "Instalando…" else "Instalar")
                }
            }
        }
    }
}

@Composable
private fun PerformanceTab(vm: LauncherViewModel) {
    val d = vm.device
    val p = vm.profile
    val s = vm.settings
    var showLog by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Aparelho", style = MaterialTheme.typography.titleMedium)
        Text("RAM: ${d.totalRamMb} MB · Núcleos: ${d.cores} · Vulkan 1.1: ${if (d.supportsVulkan11) "sim" else "não"}")
        Text(
            if (vm.runtimeBundled) "Runtime Java 21: incluído no APK" else "Runtime Java: ausente neste APK",
            color = if (vm.runtimeBundled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
        )

        Text("Resolução de render: ${(s.renderScale * 100).roundToInt()}%", style = MaterialTheme.typography.titleMedium)
        Slider(
            value = s.renderScale,
            onValueChange = { vm.updateSettings(s.copy(renderScale = (it * 20).roundToInt() / 20f)) },
            valueRange = 0.25f..1f,
        )
        Text(
            "Menos resolução = mais FPS e menos calor. 75% costuma ser imperceptível em telas Full HD.",
            style = MaterialTheme.typography.bodySmall,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Desempenho sustentado")
                Text("Clock estável em sessões longas, sem picos e quedas por aquecimento.", style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = s.sustainedPerformance, onCheckedChange = { vm.updateSettings(s.copy(sustainedPerformance = it)) })
        }

        Text("Perfil JVM automático", style = MaterialTheme.typography.titleMedium)
        Text("Heap: ${p.heapInitMb}–${p.heapMaxMb} MB")
        Text("Renderer: escolhido pela versão (1.13–1.16: GL4ES; 1.17+: LTW)")
        Text("Flags: ${p.jvmArgs().joinToString(" ")}", style = MaterialTheme.typography.bodySmall)

        OutlinedButton(onClick = { showLog = true }) { Text("Ver último log do jogo") }
    }
    if (showLog) {
        AlertDialog(
            onDismissRequest = { showLog = false },
            confirmButton = { TextButton(onClick = { showLog = false }) { Text("Fechar") } },
            title = { Text("latestlog.txt") },
            text = {
                SelectionContainer {
                    Text(vm.readLog(), Modifier.verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodySmall)
                }
            },
        )
    }
}
